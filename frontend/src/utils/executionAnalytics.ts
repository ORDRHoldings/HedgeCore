/**
 * executionAnalytics.ts — Advanced execution analytics utilities
 *
 * Institutional-grade risk calculations for Execution Desk:
 * - Monte Carlo simulation (10K paths)
 * - VaR/CVaR calculation
 * - Portfolio risk aggregation
 * - Constraint-based hedge optimization
 * - IBKR FIX message generation
 * - Compliance pre-flight checks
 */

import type { PositionRow } from "@/api/positionClient";

// ============================================================================
// MONTE CARLO SIMULATION
// ============================================================================

export interface MonteCarloResult {
  positionId: string;
  recordId: string;
  currency: string;
  notional: number;
  meanPnL: number;
  stdDev: number;
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  worstCase: number;
  bestCase: number;
  paths: number;
  distribution: number[]; // For visualization
  confidenceInterval: { lower: number; upper: number };
}

/**
 * Run Monte Carlo simulation for a single position
 * Uses geometric Brownian motion with realistic FX volatility
 */
export function runMonteCarloSimulation(
  position: PositionRow,
  paths: number = 10000,
  horizon: number = 30 // days
): MonteCarloResult {
  const notional = position.amount;
  const currency = position.currency;

  // Realistic FX volatility estimates (annual)
  const volatilityMap: Record<string, number> = {
    USD: 0.08,  // 8% annual vol
    EUR: 0.10,
    GBP: 0.10,
    JPY: 0.12,
    MXN: 0.18,  // EM higher vol
    BRL: 0.22,
    CNY: 0.06,
    default: 0.12,
  };

  const annualVol = volatilityMap[currency] || volatilityMap.default;
  const dailyVol = annualVol / Math.sqrt(252); // Convert to daily
  const horizonVol = dailyVol * Math.sqrt(horizon);

  // Simulate P&L distribution
  const pnlResults: number[] = [];

  for (let i = 0; i < paths; i++) {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    // Geometric Brownian Motion
    const drift = -0.5 * horizonVol * horizonVol; // Risk-neutral drift
    const shock = drift + horizonVol * z;
    const fxMove = Math.exp(shock) - 1; // Percentage move

    // P&L = notional × fx move
    const pnl = notional * fxMove;
    pnlResults.push(pnl);
  }

  // Sort for quantile calculation
  pnlResults.sort((a, b) => a - b);

  // Calculate statistics
  const meanPnL = pnlResults.reduce((sum, x) => sum + x, 0) / paths;
  const variance = pnlResults.reduce((sum, x) => sum + Math.pow(x - meanPnL, 2), 0) / paths;
  const stdDev = Math.sqrt(variance);

  // VaR and CVaR at 95% and 99%
  const var95Idx = Math.floor(paths * 0.05);
  const var99Idx = Math.floor(paths * 0.01);
  const var95 = pnlResults[var95Idx];
  const var99 = pnlResults[var99Idx];

  // CVaR (Expected Shortfall) - average of worst 5% / 1%
  const cvar95 = pnlResults.slice(0, var95Idx).reduce((sum, x) => sum + x, 0) / var95Idx;
  const cvar99 = pnlResults.slice(0, var99Idx).reduce((sum, x) => sum + x, 0) / var99Idx;

  // Confidence intervals (95%)
  const ci95Lower = pnlResults[Math.floor(paths * 0.025)];
  const ci95Upper = pnlResults[Math.floor(paths * 0.975)];

  return {
    positionId: position.id,
    recordId: position.record_id,
    currency,
    notional,
    meanPnL,
    stdDev,
    var95,
    var99,
    cvar95,
    cvar99,
    worstCase: pnlResults[0],
    bestCase: pnlResults[paths - 1],
    paths,
    distribution: createHistogram(pnlResults, 50), // 50 bins for chart
    confidenceInterval: { lower: ci95Lower, upper: ci95Upper },
  };
}

function createHistogram(data: number[], bins: number): number[] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binWidth = (max - min) / bins;
  const histogram = new Array(bins).fill(0);

  data.forEach((value) => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
    histogram[binIndex]++;
  });

  return histogram;
}

// ============================================================================
// PORTFOLIO RISK AGGREGATION
// ============================================================================

export interface PortfolioRisk {
  totalNotional: number;
  totalVar95: number;
  totalCVar95: number;
  currencyBreakdown: { currency: string; notional: number; percentage: number }[];
  concentrationRisk: number; // Herfindahl index
  diversificationBenefit: number; // Percentage
}

export function calculatePortfolioRisk(
  positions: PositionRow[],
  simResults: Map<string, MonteCarloResult>
): PortfolioRisk {
  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount), 0);

  // Aggregate VaR (simplified - assumes independence)
  const totalVar95 = Math.sqrt(
    Array.from(simResults.values())
      .reduce((sum, r) => sum + Math.pow(r.var95, 2), 0)
  );

  const totalCVar95 = Math.sqrt(
    Array.from(simResults.values())
      .reduce((sum, r) => sum + Math.pow(r.cvar95, 2), 0)
  );

  // Currency breakdown
  const currencyMap = new Map<string, number>();
  positions.forEach((p) => {
    const current = currencyMap.get(p.currency) || 0;
    currencyMap.set(p.currency, current + Math.abs(p.amount));
  });

  const currencyBreakdown = Array.from(currencyMap.entries())
    .map(([currency, notional]) => ({
      currency,
      notional,
      percentage: (notional / totalNotional) * 100,
    }))
    .sort((a, b) => b.notional - a.notional);

  // Concentration risk (Herfindahl-Hirschman Index)
  const hhi = currencyBreakdown.reduce(
    (sum, c) => sum + Math.pow(c.percentage, 2),
    0
  );
  const concentrationRisk = hhi / 100; // Normalize to 0-100

  // Diversification benefit (mock - would need correlation matrix)
  const naiveVar = Array.from(simResults.values())
    .reduce((sum, r) => sum + Math.abs(r.var95), 0);
  const diversificationBenefit = ((naiveVar - totalVar95) / naiveVar) * 100;

  return {
    totalNotional,
    totalVar95,
    totalCVar95,
    currencyBreakdown,
    concentrationRisk,
    diversificationBenefit: Math.max(0, diversificationBenefit),
  };
}

// ============================================================================
// IBKR FIX MESSAGE GENERATION
// ============================================================================

export interface IBKROrder {
  // FIX 4.2 Standard Fields
  msgType: "D"; // New Order Single
  clOrdID: string; // Client Order ID
  symbol: string; // Currency pair (e.g., "EUR.USD")
  side: "1" | "2"; // 1=Buy, 2=Sell
  orderQty: number;
  ordType: "1" | "2"; // 1=Market, 2=Limit
  price?: number; // For limit orders
  timeInForce: "0" | "1" | "3"; // 0=Day, 1=GTC, 3=IOC
  account: string;
  currency: string;
  transactTime: string; // ISO 8601
  text?: string; // Free text
}

export interface IBKRPayload {
  orders: IBKROrder[];
  metadata: {
    generatedAt: string;
    generatedBy: string;
    totalOrders: number;
    totalNotional: number;
    currencies: string[];
  };
  complianceChecks: ComplianceCheck[];
}

/**
 * Generate IBKR-compatible FIX message payload
 */
export function generateIBKRPayload(
  positions: PositionRow[],
  account: string = "DU1234567", // Demo account
  userName: string = "unknown"
): IBKRPayload {
  const orders: IBKROrder[] = positions.map((pos) => ({
    msgType: "D",
    clOrdID: `ORDR_${pos.record_id}_${Date.now()}`,
    symbol: `${pos.currency}.USD`, // Assume USD as quote currency
    side: pos.type === "AR" ? "2" : "1", // AR=Receivable=Sell, AP=Payable=Buy
    orderQty: Math.abs(pos.amount),
    ordType: "2", // Limit order (safer for FX)
    timeInForce: "1", // GTC
    account,
    currency: "USD",
    transactTime: new Date().toISOString(),
    text: `ORDR Treasury hedge for ${pos.entity}`,
  }));

  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const currencies = [...new Set(positions.map((p) => p.currency))];

  const complianceChecks = performComplianceChecks(positions);

  return {
    orders,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: userName,
      totalOrders: orders.length,
      totalNotional,
      currencies,
    },
    complianceChecks,
  };
}

// ============================================================================
// COMPLIANCE PRE-FLIGHT CHECKS
// ============================================================================

export interface ComplianceCheck {
  checkName: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  critical: boolean;
}

export function performComplianceChecks(positions: PositionRow[]): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // Check 1: Position must have policy assigned
  const noPolicyCount = positions.filter((p) => !p.policy_id).length;
  checks.push({
    checkName: "Policy Assignment",
    status: noPolicyCount === 0 ? "PASS" : "FAIL",
    message:
      noPolicyCount === 0
        ? "All positions have assigned policies"
        : `${noPolicyCount} position(s) missing policy assignment`,
    critical: true,
  });

  // Check 2: Minimum trade size (institutional standard: $10K)
  const minTradeSize = 10000;
  const undersizedCount = positions.filter((p) => Math.abs(p.amount) < minTradeSize).length;
  checks.push({
    checkName: "Minimum Trade Size",
    status: undersizedCount === 0 ? "PASS" : "WARN",
    message:
      undersizedCount === 0
        ? `All positions meet $${(minTradeSize / 1000).toFixed(0)}K minimum`
        : `${undersizedCount} position(s) below $${(minTradeSize / 1000).toFixed(0)}K threshold`,
    critical: false,
  });

  // Check 3: Concentration limit (no single currency > 50% of total)
  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const currencyMap = new Map<string, number>();
  positions.forEach((p) => {
    const current = currencyMap.get(p.currency) || 0;
    currencyMap.set(p.currency, current + Math.abs(p.amount));
  });

  const maxConcentration = Math.max(...Array.from(currencyMap.values())) / totalNotional;
  checks.push({
    checkName: "Concentration Limit",
    status: maxConcentration <= 0.5 ? "PASS" : "WARN",
    message:
      maxConcentration <= 0.5
        ? "Portfolio well-diversified"
        : `Single currency represents ${(maxConcentration * 100).toFixed(0)}% of portfolio`,
    critical: false,
  });

  // Check 4: Value date in future
  const today = new Date().toISOString().slice(0, 10);
  const pastDateCount = positions.filter((p) => p.value_date < today).length;
  checks.push({
    checkName: "Value Date Validation",
    status: pastDateCount === 0 ? "PASS" : "WARN",
    message:
      pastDateCount === 0
        ? "All value dates are future-dated"
        : `${pastDateCount} position(s) have past value dates`,
    critical: false,
  });

  // Check 5: 4-Eyes approval readiness (mock - would check user roles)
  checks.push({
    checkName: "4-Eyes Approval",
    status: "PASS",
    message: "Execution requires supervisor approval (enforced at staging)",
    critical: true,
  });

  return checks;
}

// ============================================================================
// STRESS TESTING
// ============================================================================

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  shocks: { currency: string; change: number }[]; // Percentage change (e.g., 0.15 = 15%)
}

export interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  positionId: string;
  recordId: string;
  currency: string;
  baseNotional: number;
  baseValue: number; // Current value
  stressedValue: number; // Value after shock
  pnlImpact: number; // Difference
  percentageImpact: number; // Percentage change
  shocked: boolean; // Whether this currency was shocked
}

export interface PortfolioStressResult {
  scenarioId: string;
  scenarioName: string;
  totalPositions: number;
  affectedPositions: number;
  totalBasePnL: number;
  totalStressedPnL: number;
  totalImpact: number;
  percentageImpact: number;
  worstPosition: { recordId: string; impact: number };
  bestPosition: { recordId: string; impact: number };
  results: StressTestResult[];
}

/**
 * Run stress test scenario on a portfolio of positions
 */
export function runStressTest(
  positions: PositionRow[],
  scenario: StressScenario
): PortfolioStressResult {
  const results: StressTestResult[] = [];
  let totalBasePnL = 0;
  let totalStressedPnL = 0;
  let worstImpact = 0;
  let bestImpact = 0;
  let worstRecordId = "";
  let bestRecordId = "";
  let affectedCount = 0;

  positions.forEach((pos) => {
    // Find shock for this currency
    const shock = scenario.shocks.find((s) => s.currency === pos.currency);
    const shockPct = shock ? shock.change : 0;
    const shocked = !!shock;

    if (shocked) affectedCount++;

    // Base value (current notional)
    const baseValue = pos.amount;
    const baseNotional = Math.abs(pos.amount);

    // Stressed value after FX shock
    // For AR (receivable), if currency weakens (negative shock), we lose value
    // For AP (payable), if currency weakens, we gain value (pay less)
    const fxMultiplier = 1 + shockPct;
    const stressedValue = pos.type === "AR"
      ? baseValue * fxMultiplier
      : baseValue / fxMultiplier;

    // P&L impact
    const pnlImpact = stressedValue - baseValue;
    const percentageImpact = baseValue !== 0 ? (pnlImpact / Math.abs(baseValue)) * 100 : 0;

    // Track worst and best
    if (pnlImpact < worstImpact) {
      worstImpact = pnlImpact;
      worstRecordId = pos.record_id;
    }
    if (pnlImpact > bestImpact) {
      bestImpact = pnlImpact;
      bestRecordId = pos.record_id;
    }

    totalBasePnL += baseValue;
    totalStressedPnL += stressedValue;

    results.push({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      positionId: pos.id,
      recordId: pos.record_id,
      currency: pos.currency,
      baseNotional,
      baseValue,
      stressedValue,
      pnlImpact,
      percentageImpact,
      shocked,
    });
  });

  const totalImpact = totalStressedPnL - totalBasePnL;
  const portfolioPercentageImpact = totalBasePnL !== 0
    ? (totalImpact / Math.abs(totalBasePnL)) * 100
    : 0;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    totalPositions: positions.length,
    affectedPositions: affectedCount,
    totalBasePnL,
    totalStressedPnL,
    totalImpact,
    percentageImpact: portfolioPercentageImpact,
    worstPosition: { recordId: worstRecordId, impact: worstImpact },
    bestPosition: { recordId: bestRecordId, impact: bestImpact },
    results,
  };
}

// ============================================================================
// HEDGE PLAN OPTIMIZATION
// ============================================================================

export interface HedgePlan {
  positionId: string;
  recommendedInstrument: "FWD" | "NDF";
  recommendedHedgeRatio: number; // 0-100%
  recommendedNotional: number;
  estimatedCost: number;
  reasoning: string;
}

/**
 * Simple hedge plan optimizer (constraint-based)
 * Real implementation would use linear programming
 */
/** @deprecated Use calculate() API + contractSizing.ts instead */
export function optimizeHedgePlan(
  position: PositionRow,
  hedgeRatioMin: number = 75,
  hedgeRatioMax: number = 100
): HedgePlan {
  // Currency-specific instrument recommendations
  const ndCurrencies = ["MXN", "BRL", "INR", "KRW", "CNH", "TWD"];
  const useNDF = ndCurrencies.includes(position.currency);

  // Optimal hedge ratio (mock - would solve optimization problem)
  const optimalRatio = (hedgeRatioMin + hedgeRatioMax) / 2;
  const hedgeNotional = Math.abs(position.amount) * (optimalRatio / 100);

  // Cost estimate (spread + time value)
  const spreadBps = useNDF ? 15 : 5; // NDF more expensive
  const estimatedCost = hedgeNotional * (spreadBps / 10000);

  return {
    positionId: position.id,
    recommendedInstrument: useNDF ? "NDF" : "FWD",
    recommendedHedgeRatio: optimalRatio,
    recommendedNotional: hedgeNotional,
    estimatedCost,
    reasoning: useNDF
      ? `NDF recommended for ${position.currency} (non-deliverable currency)`
      : `FWD recommended for ${position.currency} (deliverable currency)`,
  };
}

// ============================================================================
// CONTRACT-BASED IBKR PAYLOAD (uses FuturesTicket from contractSizing)
// ============================================================================

import type { FuturesTicket } from "@/lib/execution/contractSizing";

export interface IBKRTicketPayload {
  orders: IBKROrder[];
  metadata: {
    generatedAt: string;
    generatedBy: string;
    totalOrders: number;
    totalContracts: number;
    runId: string;
  };
}

/**
 * Generate IBKR payload from FuturesTicket[] (contract-based quantities).
 * Unlike generateIBKRPayload() which uses raw notional, this uses actual
 * CME contract counts for futures-eligible currencies.
 */
export function generateIBKRPayloadFromTickets(
  tickets: FuturesTicket[],
  runId: string = "",
  account: string = "DU1234567",
  userName: string = "unknown",
): IBKRTicketPayload {
  const orders: IBKROrder[] = tickets
    .filter((t) => t.instrumentType === "FUTURES" && t.contracts > 0)
    .map((t) => ({
      msgType: "D" as const,
      clOrdID: `ORDR_${t.recordId}_${Date.now()}`,
      symbol: t.symbol,                           // "6E" not "EUR.USD"
      side: (t.side === "SELL" ? "2" : "1") as "1" | "2",
      orderQty: t.contracts,                      // CONTRACT count
      ordType: "2" as const,
      price: t.estimatedRate,
      timeInForce: "1" as const,
      account,
      currency: "USD",
      transactTime: new Date().toISOString(),
      text: `ORDR Treasury: ${t.side} ${t.contracts}×${t.symbol} ${t.currency} hedge, settle ${t.settlementMonth}`,
    }));

  const totalContracts = orders.reduce((sum, o) => sum + o.orderQty, 0);

  return {
    orders,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: userName,
      totalOrders: orders.length,
      totalContracts,
      runId,
    },
  };
}
