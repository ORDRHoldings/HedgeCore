import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
  ScenarioBucketResult,
  PolicyConfig,
  ValidationReport,
} from '../api/types';
import { fmtMXN, fmtUSD, fmtPct } from './formatters';

// ── Coverage Analysis ──

export interface CoverageRow {
  bucket: string;
  ratio: number;
  status: 'OVER' | 'UNDER' | 'MATCHED';
}

export function bucketCoverageRatios(buckets: BucketResult[]): CoverageRow[] {
  return buckets.map(b => {
    const exposure = Math.abs(b.commercial_exposure_mxn);
    const hedged = Math.abs(b.hedge_position_mxn);
    const ratio = exposure === 0 ? 0 : hedged / exposure;
    const status: CoverageRow['status'] =
      ratio > 1.05 ? 'OVER' : ratio < 0.95 ? 'UNDER' : 'MATCHED';
    return { bucket: b.bucket, ratio, status };
  });
}

// ── Flow Composition ──

export interface FlowComposition {
  confirmedTotal: number;
  forecastTotal: number;
  confirmedPct: number;
  forecastPct: number;
}

export function flowComposition(buckets: BucketResult[]): FlowComposition {
  const confirmedTotal = buckets.reduce((s, b) => s + Math.abs(b.confirmed_flow_mxn), 0);
  const forecastTotal = buckets.reduce((s, b) => s + Math.abs(b.forecast_flow_mxn), 0);
  const total = confirmedTotal + forecastTotal;
  return {
    confirmedTotal,
    forecastTotal,
    confirmedPct: total === 0 ? 0 : confirmedTotal / total,
    forecastPct: total === 0 ? 0 : forecastTotal / total,
  };
}

// ── Concentration Analysis ──

export interface ConcentrationResult {
  peakBucket: string;
  peakAmount: number;
  percentOfTotal: number;
  herfindahlIndex: number;
}

export function concentrationAnalysis(buckets: BucketResult[]): ConcentrationResult {
  const totalExposure = buckets.reduce((s, b) => s + Math.abs(b.commercial_exposure_mxn), 0);
  let peakBucket = '';
  let peakAmount = 0;

  for (const b of buckets) {
    const abs = Math.abs(b.commercial_exposure_mxn);
    if (abs > peakAmount) {
      peakAmount = abs;
      peakBucket = b.bucket;
    }
  }

  const hhi = totalExposure === 0
    ? 0
    : buckets.reduce((s, b) => {
        const share = Math.abs(b.commercial_exposure_mxn) / totalExposure;
        return s + share * share;
      }, 0);

  return {
    peakBucket,
    peakAmount,
    percentOfTotal: totalExposure === 0 ? 0 : peakAmount / totalExposure,
    herfindahlIndex: hhi,
  };
}

// ── Instrument Mix ──

export interface InstrumentMix {
  sellCount: number;
  buyCount: number;
  suppressedCount: number;
  netDirectionLabel: string;
}

export function instrumentMix(buckets: BucketResult[]): InstrumentMix {
  let sellCount = 0;
  let buyCount = 0;
  let suppressedCount = 0;

  for (const b of buckets) {
    if (b.suppressed) suppressedCount++;
    else if (b.action_direction?.startsWith('SELL')) sellCount++;
    else if (b.action_direction?.startsWith('BUY')) buyCount++;
  }

  const netDirectionLabel = sellCount > buyCount ? 'NET SELL MXN' : sellCount < buyCount ? 'NET BUY MXN' : 'BALANCED';
  return { sellCount, buyCount, suppressedCount, netDirectionLabel };
}

// ── Scenario KPIs ──

export interface ScenarioKpis {
  worstCaseLoss: number;
  avgLossReduction: number;
  tailRiskReductionPct: number;
  efficiencyPerDollar: number;
}

export function scenarioKpis(totals: ScenarioTotalResult[], summary: HedgePlanSummary): ScenarioKpis {
  if (totals.length === 0) {
    return { worstCaseLoss: 0, avgLossReduction: 0, tailRiskReductionPct: 0, efficiencyPerDollar: 0 };
  }

  const benefits = totals.map(t => t.total_hedge_benefit_usd);
  const worstCaseLoss = Math.min(...benefits);
  const avgLossReduction = benefits.reduce((s, v) => s + v, 0) / benefits.length;

  // Tail risk: compare worst unhedged vs worst hedged at extremes
  const extremes = totals.filter(t => Math.abs(t.sigma) >= 0.08);
  let tailRiskReductionPct = 0;
  if (extremes.length > 0) {
    const worstUnhedged = Math.min(...extremes.map(t => t.total_unhedged_usd));
    const worstHedged = Math.min(...extremes.map(t => t.total_hedged_usd));
    tailRiskReductionPct = worstUnhedged !== 0 ? 1 - (worstHedged / worstUnhedged) : 0;
  }

  const efficiencyPerDollar = summary.total_friction_usd !== 0
    ? avgLossReduction / summary.total_friction_usd
    : 0;

  return { worstCaseLoss, avgLossReduction, tailRiskReductionPct, efficiencyPerDollar };
}

// ── Policy Compliance ──

export interface ComplianceCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export interface ComplianceResult {
  checks: ComplianceCheck[];
  score: number;
  classification: 'ALIGNED' | 'MINOR DEVIATIONS' | 'BREACH';
}

export function policyComplianceChecks(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
  policy: PolicyConfig,
): ComplianceResult {
  const checks: ComplianceCheck[] = [];

  // Check 1: Confirmed ratio
  const totalConfirmed = buckets.reduce((s, b) => s + Math.abs(b.confirmed_flow_mxn), 0);
  const confirmedHedged = buckets.reduce((s, b) => {
    const confirmed = Math.abs(b.confirmed_flow_mxn);
    const hedged = Math.abs(b.hedge_position_mxn);
    const exposure = Math.abs(b.commercial_exposure_mxn);
    return s + (exposure === 0 ? 0 : Math.min(hedged, confirmed));
  }, 0);
  const confirmedRatio = totalConfirmed === 0 ? 1 : confirmedHedged / totalConfirmed;
  checks.push({
    label: 'Confirmed hedge ratio target',
    pass: confirmedRatio >= policy.hedge_ratios.confirmed * 0.95,
    detail: `Target: ${fmtPct(policy.hedge_ratios.confirmed)} | Actual: ${fmtPct(confirmedRatio)}`,
  });

  // Check 2: Forecast ratio
  const totalForecast = buckets.reduce((s, b) => s + Math.abs(b.forecast_flow_mxn), 0);
  const forecastRatio = totalForecast === 0 ? 1 : summary.total_hedge_position_mxn !== 0 ? Math.abs(summary.total_hedge_position_mxn) / (totalConfirmed + totalForecast) : 0;
  checks.push({
    label: 'Forecast hedge ratio target',
    pass: forecastRatio >= policy.hedge_ratios.forecast * 0.95,
    detail: `Target: ${fmtPct(policy.hedge_ratios.forecast)} | Actual: ${fmtPct(forecastRatio)}`,
  });

  // Check 3: Min trade size
  const smallTrades = buckets.filter(b => !b.suppressed && Math.abs(b.action_usd) > 0 && Math.abs(b.action_usd) < policy.min_trade_size_usd);
  checks.push({
    label: 'Min trade size threshold',
    pass: smallTrades.length === 0,
    detail: smallTrades.length === 0 ? 'All trades above minimum' : `${smallTrades.length} below ${fmtUSD(policy.min_trade_size_usd)}`,
  });

  // Check 4: No over-hedged buckets
  const overHedged = buckets.filter(b => {
    const exposure = Math.abs(b.commercial_exposure_mxn);
    const hedged = Math.abs(b.hedge_position_mxn);
    return exposure > 0 && hedged / exposure > 1.05;
  });
  checks.push({
    label: 'No over-hedged buckets',
    pass: overHedged.length === 0,
    detail: overHedged.length === 0 ? 'All buckets within limits' : `${overHedged.length} bucket(s) over-hedged`,
  });

  // Check 5: Suppressed buckets
  const suppressedCount = buckets.filter(b => b.suppressed).length;
  checks.push({
    label: 'No suppressed buckets',
    pass: suppressedCount === 0,
    detail: suppressedCount === 0 ? 'No suppressed buckets' : `${suppressedCount} bucket(s) suppressed`,
  });

  const passed = checks.filter(c => c.pass).length;
  const score = Math.round(100 * passed / checks.length);
  const classification: ComplianceResult['classification'] =
    score === 100 ? 'ALIGNED' : score >= 80 ? 'MINOR DEVIATIONS' : 'BREACH';

  return { checks, score, classification };
}

// ── Cashflow Volatility ──

export interface CashflowVolatility {
  stdDev: number;
  coefficientOfVariation: number;
}

export function cashflowVolatility(buckets: BucketResult[]): CashflowVolatility {
  const exposures = buckets.map(b => Math.abs(b.commercial_exposure_mxn));
  if (exposures.length === 0) return { stdDev: 0, coefficientOfVariation: 0 };
  const mean = exposures.reduce((s, v) => s + v, 0) / exposures.length;
  const variance = exposures.reduce((s, v) => s + (v - mean) ** 2, 0) / exposures.length;
  const stdDev = Math.sqrt(variance);
  return { stdDev, coefficientOfVariation: mean === 0 ? 0 : stdDev / mean };
}

// ── Vulnerability Ranking ──

export interface VulnerabilityRow {
  bucket: string;
  worstCaseImpact: number;
  pctOfTotal: number;
  rank: number;
}

export function vulnerabilityRanking(
  perBucket: ScenarioBucketResult[],
  totals: ScenarioTotalResult[],
): VulnerabilityRow[] {
  // Find extreme sigma rows (+-0.10)
  const extremeSigmas = totals
    .filter(t => Math.abs(t.sigma) >= 0.08)
    .map(t => t.sigma);

  if (extremeSigmas.length === 0) return [];

  // Per bucket: find worst case at extremes
  const bucketMap: Record<string, number> = {};
  for (const row of perBucket) {
    if (extremeSigmas.some(s => Math.abs(s - row.sigma) < 0.001)) {  // epsilon compare avoids float equality bug
      const current = bucketMap[row.bucket] ?? 0;
      if (Math.abs(row.hedge_benefit_usd) > Math.abs(current)) {
        bucketMap[row.bucket] = row.hedge_benefit_usd;
      }
    }
  }

  const totalWorstCase = Object.values(bucketMap).reduce((s, v) => s + Math.abs(v), 0);

  const rows: VulnerabilityRow[] = Object.entries(bucketMap)
    .map(([bucket, impact]) => ({
      bucket,
      worstCaseImpact: impact,
      pctOfTotal: totalWorstCase === 0 ? 0 : Math.abs(impact) / totalWorstCase,
      rank: 0,
    }))
    .sort((a, b) => Math.abs(b.worstCaseImpact) - Math.abs(a.worstCaseImpact));

  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// ── Risk Posture Classification ──

export interface RiskPosture {
  posture: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
  coveragePct: number;
  residualPct: number;
  worstCaseReductionPct: number;
}

export function riskPostureClassification(
  summary: HedgePlanSummary,
  totals: ScenarioTotalResult[],
): RiskPosture {
  const totalExposure = Math.abs(summary.total_commercial_exposure_mxn);
  const coveragePct = totalExposure === 0 ? 0 : Math.abs(summary.total_hedge_position_mxn) / totalExposure;
  const residualPct = totalExposure === 0 ? 0 : Math.abs(summary.total_residual_mxn) / totalExposure;

  const kpis = scenarioKpis(totals, summary);
  const worstCaseReductionPct = kpis.tailRiskReductionPct;

  let posture: RiskPosture['posture'];
  if (coveragePct >= 0.9 && residualPct <= 0.05) {
    posture = 'CONSERVATIVE';
  } else if (coveragePct < 0.7 || residualPct > 0.2) {
    posture = 'AGGRESSIVE';
  } else {
    posture = 'BALANCED';
  }

  return { posture, coveragePct, residualPct, worstCaseReductionPct };
}

// ── Extended Engine Integration (RPT-05) ──────────────────────────────────

export interface ExtendedEngineData {
  factor_covariance: {
    condition_number?: number;
    eigenvalues?: number[];
  } | null;
  margin: {
    total_im_usd?: number;
    margin_by_bucket?: Record<string, number>;
  } | null;
  liquidity: {
    total_adv_coverage_pct?: number;
    illiquid_buckets?: string[];
  } | null;
  nav_attribution: {
    fx_delta_contribution?: number;
    total_pnl_usd?: number;
  } | null;
  tca: {
    total_cost_usd?: number;
    average_bps?: number;
  } | null;
  waterfall: {
    steps?: { label: string; value: number }[];
    net_hedge_benefit_usd?: number;
  } | null;
}

export function extractExtendedKpis(extended: ExtendedEngineData): {
  marginRequired: number | null;
  liquidityScore: number | null;  // 0-100
  tcaBps: number | null;
  netHedgeBenefit: number | null;
} {
  return {
    marginRequired: extended.margin?.total_im_usd ?? null,
    liquidityScore: extended.liquidity?.total_adv_coverage_pct != null
      ? Math.min(100, extended.liquidity.total_adv_coverage_pct * 100)
      : null,
    tcaBps: extended.tca?.average_bps ?? null,
    netHedgeBenefit: extended.waterfall?.net_hedge_benefit_usd ?? null,
  };
}

export function extendedDataAvailable(extended: ExtendedEngineData | null | undefined): boolean {
  if (!extended) return false;
  return Object.values(extended).some(v => v !== null && v !== undefined);
}

// ── Executive Narrative Engine ──

export function generateExecutiveNarrative(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
  totals: ScenarioTotalResult[],
  policy: PolicyConfig,
): string[] {
  const lines: string[] = [];
  const totalExposure = Math.abs(summary.total_commercial_exposure_mxn);
  const coverage = bucketCoverageRatios(buckets);
  const concentration = concentrationAnalysis(buckets);
  const kpis = scenarioKpis(totals, summary);
  const activeBuckets = buckets.filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0).length;

  // Line 1: Total exposure
  lines.push(
    `Total commercial exposure of ${fmtMXN(totalExposure)} MXN distributed across ${buckets.length} monthly buckets.`
  );

  // Line 2: Existing coverage
  const existingRatio = totalExposure === 0 ? 0 : Math.abs(summary.total_existing_hedges_mxn) / totalExposure;
  lines.push(
    `Existing hedge coverage stands at ${fmtPct(existingRatio)}, with ${fmtMXN(Math.abs(summary.total_residual_mxn))} MXN residual exposure.`
  );

  // Line 3: Concentration
  lines.push(
    `Exposure concentration: ${concentration.peakBucket} represents ${(concentration.percentOfTotal * 100).toFixed(0)}% of total commercial risk (HHI: ${concentration.herfindahlIndex.toFixed(3)}).`
  );

  // Line 4: Scenario impact
  if (totals.length > 0) {
    const worstTotal = totals.reduce((worst, t) =>
      t.total_hedge_benefit_usd < worst.total_hedge_benefit_usd ? t : worst, totals[0]);
    lines.push(
      `Under ${(Math.abs(worstTotal.sigma) * 100).toFixed(0)}% spot shock, net portfolio impact is ${fmtUSD(worstTotal.total_hedge_benefit_usd)}.`
    );
  }

  // Line 5: Friction
  lines.push(
    `Total hedge friction: ${fmtUSD(summary.total_friction_usd)} across ${activeBuckets} active buckets.`
  );

  // Line 6: Policy deviation (conditional)
  const underCovered = coverage.filter(c => c.status === 'UNDER').length;
  if (underCovered > 0) {
    lines.push(
      `Policy deviation: ${underCovered} bucket(s) outside target coverage ratio.`
    );
  }

  return lines;
}
