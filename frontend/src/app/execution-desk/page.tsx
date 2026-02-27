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
  runStressTest,
  type MonteCarloResult,
  type PortfolioRisk,
  type ComplianceCheck,
  type HedgePlan,
  type StressScenario,
  type PortfolioStressResult,
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

  // Advanced filters
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [maxAmount, setMaxAmount] = useState<number | null>(null);
  const [dateRangeFrom, setDateRangeFrom] = useState<string>("");
  const [dateRangeTo, setDateRangeTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Custom scenario builder
  const [showScenarioBuilder, setShowScenarioBuilder] = useState(false);
  const [customScenario, setCustomScenario] = useState<{
    name: string;
    description: string;
    shocks: { currency: string; change: number }[];
  }>({
    name: "",
    description: "",
    shocks: [],
  });
  const [simulationResults, setSimulationResults] = useState<Map<string, MonteCarloResult>>(new Map());
  const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRisk | null>(null);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [hedgePlans, setHedgePlans] = useState<Map<string, HedgePlan>>(new Map());
  const [stressScenario, setStressScenario] = useState<string>("");
  const [stressResults, setStressResults] = useState<PortfolioStressResult | null>(null);
  const [scenarioComparison, setScenarioComparison] = useState<PortfolioStressResult[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [showRiskPanel, setShowRiskPanel] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Execution history log (in-session tracking)
  interface ExecutionHistoryEntry {
    id: string;
    timestamp: string;
    action: "SIMULATION" | "STRESS_TEST" | "HEDGE_PLAN" | "COMPLIANCE" | "IBKR_EXPORT";
    positionCount: number;
    positionIds: string[];
    user: string;
    summary: string;
  }
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryEntry[]>([]);

  const addHistoryEntry = useCallback((
    action: ExecutionHistoryEntry["action"],
    positionIds: string[],
    summary: string
  ) => {
    const entry: ExecutionHistoryEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      positionCount: positionIds.length,
      positionIds,
      user: user?.email || "unknown",
      summary,
    };
    setExecutionHistory(prev => [entry, ...prev]);
  }, [user]);

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

    // Currency filter
    if (currencyFilter.length > 0) {
      filtered = filtered.filter((p) => currencyFilter.includes(p.currency));
    }

    // Amount range filter
    if (minAmount !== null) {
      filtered = filtered.filter((p) => Math.abs(p.amount) >= minAmount);
    }
    if (maxAmount !== null) {
      filtered = filtered.filter((p) => Math.abs(p.amount) <= maxAmount);
    }

    // Date range filter
    if (dateRangeFrom) {
      filtered = filtered.filter((p) => p.value_date >= dateRangeFrom);
    }
    if (dateRangeTo) {
      filtered = filtered.filter((p) => p.value_date <= dateRangeTo);
    }

    return filtered;
  }, [positions, search, currencyFilter, minAmount, maxAmount, dateRangeFrom, dateRangeTo]);

  // Get unique currencies from ready positions
  const availableCurrencies = useMemo(() => {
    return [...new Set(positions.filter(p => p.execution_status === "POLICY_ASSIGNED").map(p => p.currency))].sort();
  }, [positions]);

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

  // Real-time risk analytics (updates as selection changes)
  interface RealTimeRisk {
    totalNotional: number;
    positionCount: number;
    currencyBreakdown: { currency: string; notional: number; percentage: number; count: number }[];
    avgPositionSize: number;
    maxPositionSize: number;
    estimatedVaR95: number;  // Simplified VaR estimate (2% of notional as proxy)
    tenorDistribution: { bucket: string; count: number; notional: number }[];
  }
  const [realTimeRisk, setRealTimeRisk] = useState<RealTimeRisk | null>(null);

  // Calculate real-time risk whenever selection changes
  useEffect(() => {
    if (selected.size === 0) {
      setRealTimeRisk(null);
      return;
    }

    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const totalNotional = selectedPositions.reduce((sum, p) => sum + Math.abs(p.amount), 0);

    // Currency breakdown
    const currencyMap = new Map<string, { notional: number; count: number }>();
    selectedPositions.forEach((p) => {
      const existing = currencyMap.get(p.currency) || { notional: 0, count: 0 };
      currencyMap.set(p.currency, {
        notional: existing.notional + Math.abs(p.amount),
        count: existing.count + 1,
      });
    });
    const currencyBreakdown = Array.from(currencyMap.entries())
      .map(([currency, data]) => ({
        currency,
        notional: data.notional,
        percentage: (data.notional / totalNotional) * 100,
        count: data.count,
      }))
      .sort((a, b) => b.notional - a.notional);

    // Tenor distribution (days to maturity buckets)
    const today = new Date();
    const tenorBuckets = new Map<string, { count: number; notional: number }>();
    selectedPositions.forEach((p) => {
      const valueDate = new Date(p.value_date);
      const daysToMaturity = Math.ceil((valueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      let bucket = "0-30 days";
      if (daysToMaturity > 180) bucket = "180+ days";
      else if (daysToMaturity > 90) bucket = "90-180 days";
      else if (daysToMaturity > 30) bucket = "30-90 days";

      const existing = tenorBuckets.get(bucket) || { count: 0, notional: 0 };
      tenorBuckets.set(bucket, {
        count: existing.count + 1,
        notional: existing.notional + Math.abs(p.amount),
      });
    });
    const tenorDistribution = Array.from(tenorBuckets.entries())
      .map(([bucket, data]) => ({ bucket, count: data.count, notional: data.notional }))
      .sort((a, b) => {
        const order = ["0-30 days", "30-90 days", "90-180 days", "180+ days"];
        return order.indexOf(a.bucket) - order.indexOf(b.bucket);
      });

    // Position size stats
    const positionSizes = selectedPositions.map((p) => Math.abs(p.amount));
    const avgPositionSize = totalNotional / selectedPositions.length;
    const maxPositionSize = Math.max(...positionSizes);

    // Simplified VaR estimate: 2% of notional (rough proxy before Monte Carlo)
    const estimatedVaR95 = totalNotional * 0.02;

    setRealTimeRisk({
      totalNotional,
      positionCount: selectedPositions.length,
      currencyBreakdown,
      avgPositionSize,
      maxPositionSize,
      estimatedVaR95,
      tenorDistribution,
    });
  }, [selected, readyPositions]);

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

    // Log to history
    addHistoryEntry(
      "SIMULATION",
      selectedPositions.map(p => p.id),
      `Monte Carlo simulation (10K paths) on ${selectedPositions.length} position(s). Portfolio VaR 95%: $${fmtAmt(portRisk.totalVar95)}`
    );

    setActionMode("SIMULATE");
    setIsSimulating(false);
  }, [selected, readyPositions, addHistoryEntry]);

  // Run compliance checks
  const runComplianceChecks = useCallback(() => {
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const checks = performComplianceChecks(selectedPositions);
    setComplianceChecks(checks);

    // Log to history
    const passCount = checks.filter(c => c.status === "PASS").length;
    const failCount = checks.filter(c => c.status === "FAIL").length;
    addHistoryEntry(
      "COMPLIANCE",
      selectedPositions.map(p => p.id),
      `Pre-flight compliance check: ${passCount} passed, ${failCount} failed (${selectedPositions.length} positions)`
    );

    setActionMode("COMPLIANCE");
  }, [selected, readyPositions, addHistoryEntry]);

  // Generate hedge plans
  const generateHedgePlans = useCallback(() => {
    const plans = new Map<string, HedgePlan>();
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));

    selectedPositions.forEach((pos) => {
      const plan = optimizeHedgePlan(pos, 75, 100);
      plans.set(pos.id, plan);
    });

    setHedgePlans(plans);

    // Log to history
    const totalCost = Array.from(plans.values()).reduce((sum, p) => sum + p.estimatedCost, 0);
    addHistoryEntry(
      "HEDGE_PLAN",
      selectedPositions.map(p => p.id),
      `Generated optimized hedge plans for ${selectedPositions.length} position(s). Total estimated cost: $${fmtAmt(totalCost)}`
    );

    setActionMode("HEDGE_PLAN");
  }, [selected, readyPositions, addHistoryEntry]);

  // Run stress test scenario
  const executeStressTest = useCallback((scenarioId: string, addToComparison = false) => {
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const scenario = STRESS_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const result = runStressTest(selectedPositions, scenario);

    if (addToComparison) {
      // Add to comparison array (avoid duplicates)
      setScenarioComparison(prev => {
        const exists = prev.some(r => r.scenarioId === scenarioId);
        if (exists) {
          return prev.map(r => r.scenarioId === scenarioId ? result : r);
        }
        return [...prev, result];
      });
    } else {
      setStressResults(result);
      setStressScenario(scenarioId);
      setActionMode("STRESS_TEST");

      // Log to history
      addHistoryEntry(
        "STRESS_TEST",
        selectedPositions.map(p => p.id),
        `Stress test "${scenario.name}": Portfolio impact ${result.totalImpact >= 0 ? "+" : ""}$${fmtAmt(result.totalImpact)} (${result.percentageImpact.toFixed(1)}%)`
      );
    }
  }, [selected, readyPositions, addHistoryEntry]);

  // Export simulation results to CSV
  const exportSimulationCSV = useCallback(() => {
    if (simulationResults.size === 0) return;

    // Header row
    let csv = "Position ID,Record ID,Currency,Notional,Mean P&L,Std Dev,VaR 95%,VaR 99%,CVaR 95%,CVaR 99%,Worst Case,Best Case,CI Lower,CI Upper,Paths\n";

    // Data rows
    simulationResults.forEach((result) => {
      csv += `${result.positionId},${result.recordId},${result.currency},${result.notional},${result.meanPnL},${result.stdDev},${result.var95},${result.var99},${result.cvar95},${result.cvar99},${result.worstCase},${result.bestCase},${result.confidenceInterval.lower},${result.confidenceInterval.upper},${result.paths}\n`;
    });

    // Portfolio summary
    if (portfolioRisk) {
      csv += "\n\nPORTFOLIO SUMMARY\n";
      csv += `Total Notional,Portfolio VaR 95%,Portfolio CVaR 95%,Concentration Risk (HHI),Diversification Benefit (%)\n`;
      csv += `${portfolioRisk.totalNotional},${portfolioRisk.totalVar95},${portfolioRisk.totalCVar95},${portfolioRisk.concentrationRisk},${portfolioRisk.diversificationBenefit}\n`;
      csv += "\n\nCURRENCY BREAKDOWN\n";
      csv += "Currency,Notional,Percentage\n";
      portfolioRisk.currencyBreakdown.forEach(c => {
        csv += `${c.currency},${c.notional},${c.percentage}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `monte-carlo-simulation-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addHistoryEntry(
      "SIMULATION",
      Array.from(simulationResults.keys()),
      `Exported Monte Carlo simulation results (${simulationResults.size} positions) to CSV`
    );
  }, [simulationResults, portfolioRisk, addHistoryEntry]);

  // Export stress test results to CSV
  const exportStressTestCSV = useCallback(() => {
    if (!stressResults) return;

    // Header row
    let csv = `STRESS TEST: ${stressResults.scenarioName}\n`;
    csv += `Export Date: ${new Date().toISOString()}\n`;
    csv += `User: ${user?.email || "unknown"}\n`;
    csv += `Total Positions: ${stressResults.totalPositions}\n`;
    csv += `Affected Positions: ${stressResults.affectedPositions}\n`;
    csv += `Total Impact: ${stressResults.totalImpact}\n`;
    csv += `Percentage Impact: ${stressResults.percentageImpact}%\n\n`;

    csv += "Position ID,Record ID,Currency,Base Notional,Base Value,Stressed Value,P&L Impact,Impact %,Shocked\n";

    stressResults.results.forEach((result) => {
      csv += `${result.positionId},${result.recordId},${result.currency},${result.baseNotional},${result.baseValue},${result.stressedValue},${result.pnlImpact},${result.percentageImpact},${result.shocked}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stress-test-${stressResults.scenarioId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addHistoryEntry(
      "STRESS_TEST",
      stressResults.results.map(r => r.positionId),
      `Exported stress test "${stressResults.scenarioName}" results to CSV`
    );
  }, [stressResults, user, addHistoryEntry]);

  // Export scenario comparison as JSON
  const exportComparison = useCallback(() => {
    if (scenarioComparison.length === 0) return;

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        user: user?.email || "unknown",
        positionCount: scenarioComparison[0]?.totalPositions || 0,
        scenarioCount: scenarioComparison.length,
      },
      scenarios: scenarioComparison.map(s => ({
        scenarioName: s.scenarioName,
        totalImpact: s.totalImpact,
        percentageImpact: s.percentageImpact,
        affectedPositions: s.affectedPositions,
        worstPosition: s.worstPosition,
        bestPosition: s.bestPosition,
      })),
      fullResults: scenarioComparison,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stress-test-comparison-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [scenarioComparison, user]);

  // Export scenario comparison to CSV
  const exportComparisonCSV = useCallback(() => {
    if (scenarioComparison.length === 0) return;

    let csv = "MULTI-SCENARIO COMPARISON\n";
    csv += `Export Date: ${new Date().toISOString()}\n`;
    csv += `User: ${user?.email || "unknown"}\n`;
    csv += `Scenario Count: ${scenarioComparison.length}\n\n`;

    csv += "Scenario,Total Impact,Impact %,Total Positions,Affected Positions,Worst Position,Worst Impact,Best Position,Best Impact\n";

    scenarioComparison.forEach((scenario) => {
      csv += `${scenario.scenarioName},${scenario.totalImpact},${scenario.percentageImpact},${scenario.totalPositions},${scenario.affectedPositions},${scenario.worstPosition.recordId},${scenario.worstPosition.impact},${scenario.bestPosition.recordId},${scenario.bestPosition.impact}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scenario-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addHistoryEntry(
      "STRESS_TEST",
      [],
      `Exported scenario comparison (${scenarioComparison.length} scenarios) to CSV`
    );
  }, [scenarioComparison, user, addHistoryEntry]);

  // Export compliance checks to CSV
  const exportComplianceCSV = useCallback(() => {
    if (complianceChecks.length === 0) return;

    let csv = "COMPLIANCE PRE-FLIGHT CHECKS\n";
    csv += `Export Date: ${new Date().toISOString()}\n`;
    csv += `User: ${user?.email || "unknown"}\n`;
    csv += `Total Checks: ${complianceChecks.length}\n`;
    csv += `Passed: ${complianceChecks.filter(c => c.status === "PASS").length}\n`;
    csv += `Warnings: ${complianceChecks.filter(c => c.status === "WARN").length}\n`;
    csv += `Failed: ${complianceChecks.filter(c => c.status === "FAIL").length}\n\n`;

    csv += "Check Name,Status,Critical,Message\n";

    complianceChecks.forEach((check) => {
      csv += `${check.checkName},${check.status},${check.critical ? "YES" : "NO"},"${check.message}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compliance-checks-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addHistoryEntry(
      "COMPLIANCE",
      [],
      `Exported compliance checks (${complianceChecks.length} checks) to CSV`
    );
  }, [complianceChecks, user, addHistoryEntry]);

  // Batch operations
  const runBatchSimulation = useCallback(async () => {
    // Select all filtered positions
    const allIds = new Set(readyPositions.map(p => p.id));
    setSelected(allIds);

    // Run simulation
    setTimeout(() => runSimulation(), 100);
  }, [readyPositions, runSimulation]);

  const runBatchCompliance = useCallback(() => {
    // Select all filtered positions
    const allIds = new Set(readyPositions.map(p => p.id));
    setSelected(allIds);

    // Run compliance
    setTimeout(() => runComplianceChecks(), 100);
  }, [readyPositions, runComplianceChecks]);

  // Custom scenario execution
  const executeCustomScenario = useCallback(() => {
    if (!customScenario.name || customScenario.shocks.length === 0) {
      return;
    }

    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const scenario: StressScenario = {
      id: `custom_${Date.now()}`,
      name: customScenario.name,
      description: customScenario.description || "Custom stress test scenario",
      shocks: customScenario.shocks,
    };

    const result = runStressTest(selectedPositions, scenario);
    setStressResults(result);
    setStressScenario(scenario.id);
    setActionMode("STRESS_TEST");
    setShowScenarioBuilder(false);

    // Log to history
    addHistoryEntry(
      "STRESS_TEST",
      selectedPositions.map(p => p.id),
      `Custom stress test "${scenario.name}": Portfolio impact ${result.totalImpact >= 0 ? "+" : ""}$${fmtAmt(result.totalImpact)} (${result.percentageImpact.toFixed(1)}%)`
    );
  }, [customScenario, selected, readyPositions, addHistoryEntry]);

  const addShockToCustomScenario = useCallback((currency: string, change: number) => {
    setCustomScenario(prev => ({
      ...prev,
      shocks: [...prev.shocks.filter(s => s.currency !== currency), { currency, change }],
    }));
  }, []);

  const removeShockFromCustomScenario = useCallback((currency: string) => {
    setCustomScenario(prev => ({
      ...prev,
      shocks: prev.shocks.filter(s => s.currency !== currency),
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setCurrencyFilter([]);
    setMinAmount(null);
    setMaxAmount(null);
    setDateRangeFrom("");
    setDateRangeTo("");
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (currencyFilter.length > 0) count++;
    if (minAmount !== null) count++;
    if (maxAmount !== null) count++;
    if (dateRangeFrom) count++;
    if (dateRangeTo) count++;
    return count;
  }, [currencyFilter, minAmount, maxAmount, dateRangeFrom, dateRangeTo]);

  // Export hedge plans to CSV
  const exportHedgePlansCSV = useCallback(() => {
    if (hedgePlans.size === 0) return;

    let csv = "HEDGE PLAN RECOMMENDATIONS\n";
    csv += `Export Date: ${new Date().toISOString()}\n`;
    csv += `User: ${user?.email || "unknown"}\n`;
    csv += `Total Plans: ${hedgePlans.size}\n\n`;

    csv += "Position ID,Instrument,Hedge Ratio %,Hedge Notional,Estimated Cost,Reasoning\n";

    hedgePlans.forEach((plan, posId) => {
      const pos = readyPositions.find(p => p.id === posId);
      csv += `${pos?.record_id || posId},${plan.recommendedInstrument},${plan.recommendedHedgeRatio},${plan.recommendedNotional},${plan.estimatedCost},"${plan.reasoning}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hedge-plans-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addHistoryEntry(
      "HEDGE_PLAN",
      Array.from(hedgePlans.keys()),
      `Exported hedge plans (${hedgePlans.size} positions) to CSV`
    );
  }, [hedgePlans, readyPositions, user, addHistoryEntry]);

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

    // Log to history
    addHistoryEntry(
      "IBKR_EXPORT",
      selectedPositions.map(p => p.id),
      `Exported IBKR FIX payload (${payload.metadata.totalOrders} orders, $${fmtAmt(payload.metadata.totalNotional)} total)`
    );

    // Also show in UI
    setActionMode("IBKR_EXECUTE");
  }, [readyPositions, selected, user, addHistoryEntry]);

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
            onClick={() => setShowHistory(!showHistory)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: showHistory ? S.cyan : S.primary,
              background: showHistory ? S.bgSub : "transparent",
              border: `1px solid ${showHistory ? S.cyan : S.darkBorder}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            📜 History {executionHistory.length > 0 && `(${executionHistory.length})`}
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

            {/* Filters */}
            <div style={{ borderBottom: `1px solid ${S.soft}` }}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  width: "100%",
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: showFilters ? S.cyan : S.secondary,
                  background: showFilters ? S.bgSub : "transparent",
                  border: "none",
                  padding: "8px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                {showFilters ? "▼" : "▶"} FILTERS
                {activeFilterCount > 0 && (
                  <span style={{
                    background: S.cyan,
                    color: S.bgPanel,
                    padding: "1px 5px",
                    borderRadius: 2,
                    fontSize: 8,
                    fontWeight: 700,
                  }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {showFilters && (
                <div style={{ padding: "12px", background: S.bgSub }}>
                  {/* Currency filter */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 6, letterSpacing: "0.06em" }}>
                      CURRENCY
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {availableCurrencies.map(curr => {
                        const isSelected = currencyFilter.includes(curr);
                        return (
                          <button
                            key={curr}
                            onClick={() => {
                              if (isSelected) {
                                setCurrencyFilter(currencyFilter.filter(c => c !== curr));
                              } else {
                                setCurrencyFilter([...currencyFilter, curr]);
                              }
                            }}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: isSelected ? S.bgPanel : S.primary,
                              background: isSelected ? S.cyan : S.bgPanel,
                              border: `1px solid ${isSelected ? S.cyan : S.rim}`,
                              padding: "3px 8px",
                              cursor: "pointer",
                            }}>
                            {curr}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount range */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 6, letterSpacing: "0.06em" }}>
                      AMOUNT RANGE
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="number"
                        placeholder="Min"
                        value={minAmount || ""}
                        onChange={(e) => setMinAmount(e.target.value ? parseFloat(e.target.value) : null)}
                        style={{
                          flex: 1,
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          padding: "4px 6px",
                          background: S.bgPanel,
                          border: `1px solid ${S.rim}`,
                          color: S.primary,
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={maxAmount || ""}
                        onChange={(e) => setMaxAmount(e.target.value ? parseFloat(e.target.value) : null)}
                        style={{
                          flex: 1,
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          padding: "4px 6px",
                          background: S.bgPanel,
                          border: `1px solid ${S.rim}`,
                          color: S.primary,
                        }}
                      />
                    </div>
                  </div>

                  {/* Date range */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 6, letterSpacing: "0.06em" }}>
                      VALUE DATE RANGE
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="date"
                        value={dateRangeFrom}
                        onChange={(e) => setDateRangeFrom(e.target.value)}
                        style={{
                          flex: 1,
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          padding: "4px 6px",
                          background: S.bgPanel,
                          border: `1px solid ${S.rim}`,
                          color: S.primary,
                        }}
                      />
                      <input
                        type="date"
                        value={dateRangeTo}
                        onChange={(e) => setDateRangeTo(e.target.value)}
                        style={{
                          flex: 1,
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          padding: "4px 6px",
                          background: S.bgPanel,
                          border: `1px solid ${S.rim}`,
                          color: S.primary,
                        }}
                      />
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      style={{
                        width: "100%",
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.tertiary,
                        background: "transparent",
                        border: `1px solid ${S.rim}`,
                        padding: "4px",
                        cursor: "pointer",
                      }}>
                      CLEAR ALL FILTERS
                    </button>
                  )}
                </div>
              )}
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
              <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 6 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 6, letterSpacing: "0.06em" }}>
                  BATCH OPERATIONS
                </div>
                <button
                  onClick={runBatchSimulation}
                  disabled={readyPositions.length === 0}
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: readyPositions.length === 0 ? S.tertiary : S.cyan,
                    background: "transparent",
                    border: `1px solid ${readyPositions.length === 0 ? S.rim : S.cyan}`,
                    padding: "5px 10px",
                    cursor: readyPositions.length === 0 ? "not-allowed" : "pointer",
                    marginBottom: 4,
                  }}>
                  ⚡ SIMULATE ALL ({readyPositions.length})
                </button>
                <button
                  onClick={runBatchCompliance}
                  disabled={readyPositions.length === 0}
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: readyPositions.length === 0 ? S.tertiary : S.amber,
                    background: "transparent",
                    border: `1px solid ${readyPositions.length === 0 ? S.rim : S.amber}`,
                    padding: "5px 10px",
                    cursor: readyPositions.length === 0 ? "not-allowed" : "pointer",
                  }}>
                  ✓ CHECK ALL ({readyPositions.length})
                </button>
              </div>
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
                onClick={() => {
                  setActionMode("STRESS_TEST");
                  setStressResults(null);
                  setStressScenario("");
                }}
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
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      color: S.primary,
                      letterSpacing: "0.06em",
                    }}>
                      MONTE CARLO SIMULATION RESULTS
                    </div>
                    <button
                      onClick={exportSimulationCSV}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.primary,
                        background: "transparent",
                        border: `1px solid ${S.darkBorder}`,
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}>
                      ↓ EXPORT CSV
                    </button>
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
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      color: S.primary,
                      letterSpacing: "0.06em",
                    }}>
                      STRESS TEST SCENARIOS
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {scenarioComparison.length > 0 && (
                        <button
                          onClick={() => setShowComparison(!showComparison)}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: showComparison ? S.cyan : S.primary,
                            background: showComparison ? S.bgSub : "transparent",
                            border: `1px solid ${showComparison ? S.cyan : S.darkBorder}`,
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}>
                          {showComparison ? "✓ " : ""}COMPARE ({scenarioComparison.length})
                        </button>
                      )}
                      {scenarioComparison.length > 0 && (
                        <>
                          <button
                            onClick={exportComparisonCSV}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.primary,
                              background: "transparent",
                              border: `1px solid ${S.darkBorder}`,
                              padding: "4px 10px",
                              cursor: "pointer",
                            }}>
                            ↓ CSV
                          </button>
                          <button
                            onClick={exportComparison}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.primary,
                              background: "transparent",
                              border: `1px solid ${S.darkBorder}`,
                              padding: "4px 10px",
                              cursor: "pointer",
                            }}>
                            ↓ JSON
                          </button>
                        </>
                      )}
                      {scenarioComparison.length > 0 && (
                        <button
                          onClick={() => setScenarioComparison([])}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.tertiary,
                            background: "transparent",
                            border: `1px solid ${S.darkBorder}`,
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}>
                          CLEAR
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scenario Comparison View */}
                  {showComparison && scenarioComparison.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{
                        padding: 16,
                        border: `2px solid ${S.cyan}`,
                        background: S.bgPanel,
                        marginBottom: 16,
                      }}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: S.primary,
                          marginBottom: 16,
                          letterSpacing: "0.06em",
                        }}>
                          SCENARIO COMPARISON — {scenarioComparison.length} SCENARIOS
                        </div>

                        {/* Comparison Table */}
                        <div style={{ overflowX: "auto" }}>
                          <table style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontFamily: S.fontMono,
                            fontSize: 10,
                          }}>
                            <thead>
                              <tr style={{ borderBottom: `2px solid ${S.rim}` }}>
                                <th style={{ textAlign: "left", padding: "8px 12px", color: S.tertiary }}>Scenario</th>
                                <th style={{ textAlign: "right", padding: "8px 12px", color: S.tertiary }}>Total Impact</th>
                                <th style={{ textAlign: "right", padding: "8px 12px", color: S.tertiary }}>Impact %</th>
                                <th style={{ textAlign: "right", padding: "8px 12px", color: S.tertiary }}>Affected</th>
                                <th style={{ textAlign: "right", padding: "8px 12px", color: S.tertiary }}>Worst Position</th>
                                <th style={{ textAlign: "right", padding: "8px 12px", color: S.tertiary }}>Worst Impact</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scenarioComparison
                                .sort((a, b) => a.totalImpact - b.totalImpact) // Worst first
                                .map((scenario, idx) => (
                                  <tr
                                    key={scenario.scenarioId}
                                    style={{
                                      borderBottom: `1px solid ${S.soft}`,
                                      background: idx % 2 === 0 ? S.bgSub : "transparent",
                                    }}>
                                    <td style={{ padding: "10px 12px", color: S.primary, fontWeight: 700 }}>
                                      {scenario.scenarioName}
                                    </td>
                                    <td style={{
                                      padding: "10px 12px",
                                      textAlign: "right",
                                      color: scenario.totalImpact < 0 ? S.fail : S.pass,
                                      fontWeight: 700,
                                    }}>
                                      {scenario.totalImpact >= 0 ? "+" : ""}${fmtAmt(scenario.totalImpact)}
                                    </td>
                                    <td style={{
                                      padding: "10px 12px",
                                      textAlign: "right",
                                      color: scenario.percentageImpact < 0 ? S.fail : S.pass,
                                    }}>
                                      {scenario.percentageImpact >= 0 ? "+" : ""}{scenario.percentageImpact.toFixed(2)}%
                                    </td>
                                    <td style={{ padding: "10px 12px", textAlign: "right", color: S.secondary }}>
                                      {scenario.affectedPositions} / {scenario.totalPositions}
                                    </td>
                                    <td style={{ padding: "10px 12px", textAlign: "right", color: S.secondary }}>
                                      {scenario.worstPosition.recordId.slice(0, 8)}
                                    </td>
                                    <td style={{
                                      padding: "10px 12px",
                                      textAlign: "right",
                                      color: S.fail,
                                      fontWeight: 700,
                                    }}>
                                      ${fmtAmt(scenario.worstPosition.impact)}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Comparison Chart */}
                        <div style={{ marginTop: 20 }}>
                          <ReactECharts
                            option={{
                              backgroundColor: "transparent",
                              tooltip: {
                                trigger: "axis",
                                axisPointer: { type: "shadow" },
                                backgroundColor: "#1A2535EE",
                                borderColor: S.darkBorder,
                                borderWidth: 1,
                                textStyle: { color: S.primary, fontSize: 10, fontFamily: S.fontMono },
                              },
                              grid: { left: 100, right: 20, top: 30, bottom: 50 },
                              xAxis: {
                                type: "value",
                                name: "Portfolio Impact ($)",
                                nameLocation: "center",
                                nameGap: 30,
                                nameTextStyle: { color: S.tertiary, fontSize: 10, fontFamily: S.fontMono },
                                axisLabel: {
                                  color: S.tertiary,
                                  fontSize: 9,
                                  fontFamily: S.fontMono,
                                  formatter: (v: number) =>
                                    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                                    : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
                                    : v <= -1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                                    : v <= -1_000 ? `$${(v / 1_000).toFixed(0)}K`
                                    : `$${v.toFixed(0)}`,
                                },
                                axisLine: { lineStyle: { color: S.darkBorder } },
                                splitLine: { lineStyle: { color: S.darkBorder, type: "dashed", opacity: 0.3 } },
                              },
                              yAxis: {
                                type: "category",
                                data: scenarioComparison.map(s => s.scenarioName),
                                axisLabel: { color: S.primary, fontSize: 10, fontFamily: S.fontMono },
                                axisLine: { lineStyle: { color: S.darkBorder } },
                              },
                              series: [{
                                type: "bar",
                                data: scenarioComparison.map(s => ({
                                  value: s.totalImpact,
                                  itemStyle: {
                                    color: s.totalImpact < 0 ? {
                                      type: "linear",
                                      x: 1, y: 0, x2: 0, y2: 0,
                                      colorStops: [
                                        { offset: 0, color: S.fail + "DD" },
                                        { offset: 1, color: S.fail + "88" },
                                      ],
                                    } : {
                                      type: "linear",
                                      x: 0, y: 0, x2: 1, y2: 0,
                                      colorStops: [
                                        { offset: 0, color: S.pass + "DD" },
                                        { offset: 1, color: S.pass + "88" },
                                      ],
                                    },
                                  },
                                })),
                                barMaxWidth: 40,
                                label: {
                                  show: true,
                                  position: "right",
                                  fontSize: 9,
                                  fontFamily: S.fontMono,
                                  color: S.primary,
                                  formatter: (p: { value: number }) =>
                                    `${p.value >= 0 ? "+" : ""}$${fmtAmt(p.value)}`,
                                },
                              }],
                            } as EChartsOption}
                            style={{ height: 200 + scenarioComparison.length * 40, width: "100%" }}
                            opts={{ renderer: "canvas" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scenario Selection */}
                  {!stressResults && !showComparison && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Custom Scenario Button */}
                      <button
                        onClick={() => setShowScenarioBuilder(true)}
                        style={{
                          padding: 16,
                          border: `2px dashed ${S.cyan}`,
                          background: S.bgPanel,
                          cursor: "pointer",
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: S.cyan,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}>
                        + CREATE CUSTOM SCENARIO
                      </button>

                      {STRESS_SCENARIOS.map((scenario) => {
                        const inComparison = scenarioComparison.some(s => s.scenarioId === scenario.id);
                        return (
                          <div
                            key={scenario.id}
                            style={{
                              padding: 16,
                              border: `1px solid ${inComparison ? S.cyan : S.rim}`,
                              background: S.bgSub,
                              position: "relative",
                            }}>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 11,
                              fontWeight: 700,
                              color: S.primary,
                              marginBottom: 8,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}>
                              {scenario.name}
                              {inComparison && (
                                <span style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 8,
                                  color: S.cyan,
                                  background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                                  border: `1px solid ${S.cyan}`,
                                  padding: "2px 6px",
                                }}>
                                  IN COMPARISON
                                </span>
                              )}
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
                              marginBottom: 12,
                            }}>
                              Shocks: {scenario.shocks.map((s) => `${s.currency} ${s.change > 0 ? "+" : ""}${(s.change * 100).toFixed(0)}%`).join(", ")}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => executeStressTest(scenario.id, false)}
                                style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 9,
                                  color: S.primary,
                                  background: S.bgPanel,
                                  border: `1px solid ${S.darkBorder}`,
                                  padding: "4px 12px",
                                  cursor: "pointer",
                                  flex: 1,
                                }}>
                                RUN TEST
                              </button>
                              <button
                                onClick={() => executeStressTest(scenario.id, true)}
                                style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 9,
                                  color: inComparison ? S.cyan : S.secondary,
                                  background: "transparent",
                                  border: `1px solid ${inComparison ? S.cyan : S.darkBorder}`,
                                  padding: "4px 12px",
                                  cursor: "pointer",
                                  flex: 1,
                                }}>
                                {inComparison ? "✓ " : "+ "}ADD TO COMPARE
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Stress Test Results */}
                  {stressResults && (
                    <div>
                      {/* Portfolio Impact Summary */}
                      <div style={{
                        padding: 16,
                        border: `2px solid ${stressResults.totalImpact < 0 ? S.fail : S.pass}`,
                        background: S.bgPanel,
                        marginBottom: 16,
                      }}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 12,
                        }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            color: S.primary,
                            letterSpacing: "0.06em",
                          }}>
                            PORTFOLIO IMPACT — {stressResults.scenarioName.toUpperCase()}
                          </div>
                          <button
                            onClick={exportStressTestCSV}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.primary,
                              background: "transparent",
                              border: `1px solid ${S.darkBorder}`,
                              padding: "4px 10px",
                              cursor: "pointer",
                            }}>
                            ↓ EXPORT CSV
                          </button>
                        </div>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 12,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                        }}>
                          <div>
                            <div style={{ color: S.tertiary, marginBottom: 4 }}>Total Impact</div>
                            <div style={{
                              color: stressResults.totalImpact < 0 ? S.fail : S.pass,
                              fontWeight: 700,
                              fontSize: 14,
                            }}>
                              {stressResults.totalImpact >= 0 ? "+" : ""}${fmtAmt(stressResults.totalImpact)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: S.tertiary, marginBottom: 4 }}>Percentage Impact</div>
                            <div style={{
                              color: stressResults.percentageImpact < 0 ? S.fail : S.pass,
                              fontWeight: 700,
                              fontSize: 14,
                            }}>
                              {stressResults.percentageImpact >= 0 ? "+" : ""}{stressResults.percentageImpact.toFixed(2)}%
                            </div>
                          </div>
                          <div>
                            <div style={{ color: S.tertiary, marginBottom: 4 }}>Affected Positions</div>
                            <div style={{ color: S.primary, fontWeight: 700 }}>
                              {stressResults.affectedPositions} / {stressResults.totalPositions}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: S.tertiary, marginBottom: 4 }}>Worst Position</div>
                            <div style={{ color: S.fail, fontWeight: 700 }}>
                              {stressResults.worstPosition.recordId.slice(0, 8)}
                              <br />
                              ${fmtAmt(stressResults.worstPosition.impact)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Position-Level Results */}
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                      }}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: S.primary,
                          letterSpacing: "0.06em",
                        }}>
                          POSITION-LEVEL RESULTS
                        </div>
                        <button
                          onClick={() => {
                            setStressResults(null);
                            setStressScenario("");
                          }}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.primary,
                            background: "transparent",
                            border: `1px solid ${S.darkBorder}`,
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}>
                          ← Back to Scenarios
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {stressResults.results
                          .sort((a, b) => a.pnlImpact - b.pnlImpact) // Worst first
                          .map((result) => (
                            <div
                              key={result.positionId}
                              style={{
                                padding: 16,
                                border: `1px solid ${S.rim}`,
                                borderLeft: `4px solid ${result.pnlImpact < 0 ? S.fail : result.pnlImpact > 0 ? S.pass : S.neutral}`,
                                background: S.bgSub,
                              }}>
                              <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 10,
                              }}>
                                <div style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: S.primary,
                                }}>
                                  {result.recordId} — {result.currency} ${fmtAmt(result.baseNotional)}
                                </div>
                                {result.shocked && (
                                  <div style={{
                                    fontFamily: S.fontMono,
                                    fontSize: 9,
                                    color: S.amber,
                                    background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
                                    border: `1px solid ${S.amber}`,
                                    padding: "2px 6px",
                                  }}>
                                    SHOCKED
                                  </div>
                                )}
                              </div>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(4, 1fr)",
                                gap: 12,
                                fontFamily: S.fontMono,
                                fontSize: 10,
                              }}>
                                <div>
                                  <div style={{ color: S.tertiary, marginBottom: 4 }}>Base Value</div>
                                  <div style={{ color: S.primary }}>${fmtAmt(result.baseValue)}</div>
                                </div>
                                <div>
                                  <div style={{ color: S.tertiary, marginBottom: 4 }}>Stressed Value</div>
                                  <div style={{ color: S.primary }}>${fmtAmt(result.stressedValue)}</div>
                                </div>
                                <div>
                                  <div style={{ color: S.tertiary, marginBottom: 4 }}>P&L Impact</div>
                                  <div style={{
                                    color: result.pnlImpact < 0 ? S.fail : result.pnlImpact > 0 ? S.pass : S.neutral,
                                    fontWeight: 700,
                                  }}>
                                    {result.pnlImpact >= 0 ? "+" : ""}${fmtAmt(result.pnlImpact)}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: S.tertiary, marginBottom: 4 }}>Impact %</div>
                                  <div style={{
                                    color: result.percentageImpact < 0 ? S.fail : result.percentageImpact > 0 ? S.pass : S.neutral,
                                    fontWeight: 700,
                                  }}>
                                    {result.percentageImpact >= 0 ? "+" : ""}{result.percentageImpact.toFixed(2)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {actionMode === "HEDGE_PLAN" && hedgePlans.size > 0 && (
                <div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      color: S.primary,
                      letterSpacing: "0.06em",
                    }}>
                      OPTIMIZED HEDGE PLANS
                    </div>
                    <button
                      onClick={exportHedgePlansCSV}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.primary,
                        background: "transparent",
                        border: `1px solid ${S.darkBorder}`,
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}>
                      ↓ EXPORT CSV
                    </button>
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
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      color: S.primary,
                      letterSpacing: "0.06em",
                    }}>
                      COMPLIANCE PRE-FLIGHT CHECKS
                    </div>
                    <button
                      onClick={exportComplianceCSV}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.primary,
                        background: "transparent",
                        border: `1px solid ${S.darkBorder}`,
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}>
                      ↓ EXPORT CSV
                    </button>
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
                {!realTimeRisk ? (
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
                        {realTimeRisk.positionCount}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>
                        position{realTimeRisk.positionCount > 1 ? "s" : ""} selected
                      </div>
                    </div>

                    {/* Total Exposure */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        TOTAL EXPOSURE
                      </div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 16,
                        color: S.primary,
                        fontWeight: 700,
                      }}>
                        ${fmtAmt(realTimeRisk.totalNotional)}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, marginTop: 4 }}>
                        Aggregate notional value
                      </div>
                    </div>

                    {/* VaR Estimate (Real-time) */}
                    <div style={{
                      padding: 12,
                      background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
                      border: `1px solid ${S.fail}`,
                    }}>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.tertiary,
                        marginBottom: 6,
                        letterSpacing: "0.06em",
                      }}>
                        ESTIMATED VaR 95%
                      </div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 16,
                        color: S.fail,
                        fontWeight: 700,
                      }}>
                        ${fmtAmt(realTimeRisk.estimatedVaR95)}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginTop: 4 }}>
                        Simplified estimate • Run simulation for precise VaR
                      </div>
                    </div>

                    {/* Position Size Stats */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        POSITION SIZING
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>Average:</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.primary, fontWeight: 700 }}>
                          ${fmtAmt(realTimeRisk.avgPositionSize)}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>Largest:</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.primary, fontWeight: 700 }}>
                          ${fmtAmt(realTimeRisk.maxPositionSize)}
                        </span>
                      </div>
                    </div>

                    {/* Currency Concentration */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        CURRENCY BREAKDOWN
                      </div>
                      {realTimeRisk.currencyBreakdown.slice(0, 5).map((c) => (
                        <div
                          key={c.currency}
                          style={{
                            marginBottom: 8,
                          }}>
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}>
                            <span style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.primary,
                              fontWeight: 700,
                            }}>
                              {c.currency}
                            </span>
                            <span style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.secondary,
                            }}>
                              {c.percentage.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{
                            height: 4,
                            background: S.bgSub,
                            position: "relative" as const,
                          }}>
                            <div style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              height: "100%",
                              width: `${c.percentage}%`,
                              background: S.cyan,
                            }} />
                          </div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 8,
                            color: S.tertiary,
                            marginTop: 2,
                          }}>
                            ${fmtAmt(c.notional)} • {c.count} position{c.count > 1 ? "s" : ""}
                          </div>
                        </div>
                      ))}
                      {realTimeRisk.currencyBreakdown.length > 5 && (
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 8,
                          color: S.tertiary,
                          marginTop: 4,
                        }}>
                          +{realTimeRisk.currencyBreakdown.length - 5} more currencies
                        </div>
                      )}
                    </div>

                    {/* Tenor Distribution */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        TENOR DISTRIBUTION
                      </div>
                      {realTimeRisk.tenorDistribution.map((t) => {
                        const pct = (t.notional / realTimeRisk.totalNotional) * 100;
                        return (
                          <div
                            key={t.bucket}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                            }}>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.secondary,
                              width: 80,
                              flexShrink: 0,
                            }}>
                              {t.bucket}
                            </div>
                            <div style={{
                              flex: 1,
                              height: 16,
                              background: S.bgSub,
                              position: "relative" as const,
                            }}>
                              <div style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${pct}%`,
                                background: S.amber,
                              }} />
                              <div style={{
                                position: "absolute",
                                right: 4,
                                top: "50%",
                                transform: "translateY(-50%)",
                                fontFamily: S.fontMono,
                                fontSize: 8,
                                color: pct > 50 ? S.bgPanel : S.primary,
                                fontWeight: 700,
                              }}>
                                {t.count}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Portfolio Risk (if simulation run) */}
                    {portfolioRisk && (
                      <>
                        <div style={{ borderTop: `2px solid ${S.cyan}`, paddingTop: 16 }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.cyan,
                            marginBottom: 12,
                            letterSpacing: "0.06em",
                          }}>
                            ⚡ MONTE CARLO RESULTS
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.tertiary,
                              marginBottom: 6,
                              letterSpacing: "0.06em",
                            }}>
                              VaR 95% (Simulated)
                            </div>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 16,
                              color: S.fail,
                              fontWeight: 700,
                            }}>
                              ${fmtAmt(portfolioRisk.totalVar95)}
                            </div>
                            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.secondary, marginTop: 4 }}>
                              10,000 paths • 95% confidence
                            </div>
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.tertiary,
                              marginBottom: 6,
                              letterSpacing: "0.06em",
                            }}>
                              CONCENTRATION RISK
                            </div>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 14,
                              color: portfolioRisk.concentrationRisk > 25 ? S.amber : S.pass,
                              fontWeight: 700,
                            }}>
                              {portfolioRisk.concentrationRisk.toFixed(0)}
                            </div>
                            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.secondary, marginTop: 4 }}>
                              HHI • {portfolioRisk.concentrationRisk > 25 ? "Concentrated" : "Diversified"}
                            </div>
                          </div>

                          <div>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.tertiary,
                              marginBottom: 6,
                              letterSpacing: "0.06em",
                            }}>
                              DIVERSIFICATION
                            </div>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 14,
                              color: S.pass,
                              fontWeight: 700,
                            }}>
                              {portfolioRisk.diversificationBenefit.toFixed(1)}%
                            </div>
                            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.secondary, marginTop: 4 }}>
                              Portfolio risk reduction
                            </div>
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

      {/* Execution History Overlay */}
      {showHistory && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
        onClick={() => setShowHistory(false)}>
          <div
            style={{
              width: "100%",
              maxWidth: 900,
              maxHeight: "80vh",
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${S.rim}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: S.primary,
                  letterSpacing: "0.06em",
                }}>
                  EXECUTION HISTORY & AUDIT TRAIL
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: S.tertiary,
                  marginTop: 4,
                }}>
                  Session log of all execution desk actions (in-memory)
                </div>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  background: "transparent",
                  border: `1px solid ${S.darkBorder}`,
                  padding: "4px 12px",
                  cursor: "pointer",
                }}>
                ✕ Close
              </button>
            </div>

            {/* History List */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {executionHistory.length === 0 ? (
                <div style={{
                  textAlign: "center",
                  padding: 60,
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.tertiary,
                }}>
                  No execution history yet.
                  <br /><br />
                  Run simulations, compliance checks, or generate hedge plans to see activity here.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {executionHistory.map((entry) => {
                    const actionColors = {
                      SIMULATION: S.cyan,
                      STRESS_TEST: S.amber,
                      HEDGE_PLAN: S.pass,
                      COMPLIANCE: S.neutral,
                      IBKR_EXPORT: S.fail,
                    };
                    const actionLabels = {
                      SIMULATION: "MONTE CARLO SIMULATION",
                      STRESS_TEST: "STRESS TEST",
                      HEDGE_PLAN: "HEDGE PLAN OPTIMIZATION",
                      COMPLIANCE: "COMPLIANCE CHECK",
                      IBKR_EXPORT: "IBKR PAYLOAD EXPORT",
                    };
                    const actionColor = actionColors[entry.action];
                    const actionLabel = actionLabels[entry.action];

                    return (
                      <div
                        key={entry.id}
                        style={{
                          padding: 16,
                          border: `1px solid ${S.rim}`,
                          borderLeft: `4px solid ${actionColor}`,
                          background: S.bgSub,
                        }}>
                        <div style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          marginBottom: 10,
                        }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: actionColor,
                            background: `color-mix(in srgb, ${actionColor} 10%, transparent)`,
                            border: `1px solid ${actionColor}`,
                            padding: "3px 8px",
                            letterSpacing: "0.06em",
                            fontWeight: 700,
                          }}>
                            {actionLabel}
                          </div>
                          <div style={{ flex: 1 }} />
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.tertiary,
                          }}>
                            {new Date(entry.timestamp).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </div>
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.secondary,
                          marginBottom: 8,
                        }}>
                          {entry.summary}
                        </div>
                        <div style={{
                          display: "flex",
                          gap: 16,
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          color: S.tertiary,
                        }}>
                          <div>
                            <span style={{ color: S.primary }}>Positions:</span> {entry.positionCount}
                          </div>
                          <div>
                            <span style={{ color: S.primary }}>User:</span> {entry.user}
                          </div>
                          <div>
                            <span style={{ color: S.primary }}>ID:</span> {entry.id.slice(0, 12)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {executionHistory.length > 0 && (
              <div style={{
                padding: "12px 20px",
                borderTop: `1px solid ${S.rim}`,
                background: S.bgDeep,
                fontFamily: S.fontMono,
                fontSize: 9,
                color: S.tertiary,
              }}>
                <strong style={{ color: S.primary }}>Note:</strong> This history is session-based (in-memory).
                For persistent audit trail, see <span style={{ color: S.cyan }}>Audit Trail</span> page (linked to database audit_events table).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Scenario Builder Modal */}
      {showScenarioBuilder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
          }}
          onClick={() => setShowScenarioBuilder(false)}>
          <div
            style={{
              width: "100%",
              maxWidth: 700,
              maxHeight: "80vh",
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${S.rim}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                color: S.primary,
                letterSpacing: "0.06em",
              }}>
                CUSTOM STRESS TEST SCENARIO BUILDER
              </div>
              <button
                onClick={() => setShowScenarioBuilder(false)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  background: "transparent",
                  border: `1px solid ${S.darkBorder}`,
                  padding: "4px 12px",
                  cursor: "pointer",
                }}>
                ✕ Close
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {/* Scenario Name */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: S.tertiary,
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}>
                  SCENARIO NAME *
                </div>
                <input
                  type="text"
                  value={customScenario.name}
                  onChange={(e) => setCustomScenario({ ...customScenario, name: e.target.value })}
                  placeholder="e.g., Euro Crisis 2026"
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    padding: "8px 12px",
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    color: S.primary,
                    outline: "none",
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: S.tertiary,
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}>
                  DESCRIPTION
                </div>
                <textarea
                  value={customScenario.description}
                  onChange={(e) => setCustomScenario({ ...customScenario, description: e.target.value })}
                  placeholder="Describe the scenario assumptions..."
                  rows={3}
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    padding: "8px 12px",
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    color: S.primary,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Shocks */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: S.tertiary,
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}>
                  CURRENCY SHOCKS * (at least one required)
                </div>

                {/* Current shocks */}
                {customScenario.shocks.length > 0 && (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {customScenario.shocks.map((shock) => (
                      <div
                        key={shock.currency}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          background: S.bgSub,
                          border: `1px solid ${S.rim}`,
                        }}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.primary,
                          fontWeight: 700,
                          width: 50,
                        }}>
                          {shock.currency}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: shock.change < 0 ? S.fail : S.pass,
                          flex: 1,
                        }}>
                          {shock.change > 0 ? "+" : ""}{(shock.change * 100).toFixed(1)}%
                        </div>
                        <button
                          onClick={() => removeShockFromCustomScenario(shock.currency)}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.tertiary,
                            background: "transparent",
                            border: `1px solid ${S.rim}`,
                            padding: "2px 8px",
                            cursor: "pointer",
                          }}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add shock form */}
                <div style={{
                  padding: 12,
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                }}>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: S.tertiary,
                    marginBottom: 8,
                  }}>
                    Add Currency Shock:
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      id="shock-currency"
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        padding: "6px 10px",
                        background: S.bgPanel,
                        border: `1px solid ${S.rim}`,
                        color: S.primary,
                        flex: 1,
                      }}>
                      <option value="">Select currency...</option>
                      {availableCurrencies.map(curr => (
                        <option key={curr} value={curr}>{curr}</option>
                      ))}
                    </select>
                    <input
                      id="shock-change"
                      type="number"
                      step="0.01"
                      placeholder="% change"
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        padding: "6px 10px",
                        background: S.bgPanel,
                        border: `1px solid ${S.rim}`,
                        color: S.primary,
                        width: 100,
                      }}
                    />
                    <button
                      onClick={() => {
                        const currencySelect = document.getElementById("shock-currency") as HTMLSelectElement;
                        const changeInput = document.getElementById("shock-change") as HTMLInputElement;
                        const currency = currencySelect.value;
                        const change = parseFloat(changeInput.value);

                        if (currency && !isNaN(change)) {
                          addShockToCustomScenario(currency, change / 100);
                          currencySelect.value = "";
                          changeInput.value = "";
                        }
                      }}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.primary,
                        background: S.cyan,
                        border: "none",
                        padding: "6px 12px",
                        cursor: "pointer",
                      }}>
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div style={{
                padding: 12,
                background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                border: `1px solid ${S.cyan}`,
                fontFamily: S.fontMono,
                fontSize: 9,
                color: S.secondary,
              }}>
                <strong style={{ color: S.primary }}>Tip:</strong> Enter shock as percentage. Positive values = currency strengthens, negative = weakens.
                Example: EUR +10% = Euro strengthens 10% vs USD, MXN -15% = Peso weakens 15%.
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 20px",
              borderTop: `1px solid ${S.rim}`,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}>
              <button
                onClick={() => {
                  setCustomScenario({ name: "", description: "", shocks: [] });
                  setShowScenarioBuilder(false);
                }}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  background: "transparent",
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 16px",
                  cursor: "pointer",
                }}>
                Cancel
              </button>
              <button
                onClick={executeCustomScenario}
                disabled={!customScenario.name || customScenario.shocks.length === 0 || selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: (!customScenario.name || customScenario.shocks.length === 0 || selected.size === 0) ? S.tertiary : S.bgPanel,
                  background: (!customScenario.name || customScenario.shocks.length === 0 || selected.size === 0) ? S.bgSub : S.cyan,
                  border: "none",
                  padding: "6px 16px",
                  cursor: (!customScenario.name || customScenario.shocks.length === 0 || selected.size === 0) ? "not-allowed" : "pointer",
                }}>
                RUN TEST ({selected.size} positions)
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpPanel config={EXECUTION_DESK_HELP} storageKey="execution-desk" />
    </div>
  );
}
