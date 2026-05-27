/**
 * reportNarratives.ts
 *
 * Institutional FX hedge report narrative generation engine.
 * Produces formal, multi-paragraph analytical text for each report section.
 * All output is deterministic — derived from numeric data, not AI inference.
 */

import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
  ScenarioBucketResult,
  PolicyConfig,
  ValidationReport,
} from '../api/types';

import {
  bucketCoverageRatios,
  flowComposition,
  concentrationAnalysis,
  cashflowVolatility,
  instrumentMix,
  scenarioKpis,
  policyComplianceChecks,
  riskPostureClassification,
  vulnerabilityRanking,
} from './reportCalcs';

import { fmtMXN, fmtUSD, fmtPct, fmtSigma } from './formatters';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NarrativeParagraph {
  heading?: string;
  text: string;
  type: 'OVERVIEW' | 'ANALYSIS' | 'FINDING' | 'METHODOLOGY' | 'RECOMMENDATION' | 'DISCLAIMER';
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  return denominator === 0 ? fallback : numerator / denominator;
}

function abs(v: number): number {
  return Math.abs(v);
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + 's');
}

function hhiLabel(hhi: number): string {
  if (hhi < 0.15) return 'well-diversified';
  if (hhi < 0.25) return 'moderately concentrated';
  return 'highly concentrated';
}

function cvLabel(cv: number): string {
  if (cv < 0.3) return 'low';
  if (cv < 0.7) return 'moderate';
  return 'high';
}

function postureInterpretation(
  posture: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE',
  coveragePct: number,
  residualPct: number,
): string {
  switch (posture) {
    case 'CONSERVATIVE':
      return (
        `Coverage ratio of ${fmtPct(coveragePct)} with only ${fmtPct(residualPct)} residual exposure ` +
        `indicates a risk-averse hedge posture. The portfolio maintains substantial downside protection ` +
        `with minimal unhedged risk, consistent with conservative treasury mandates.`
      );
    case 'BALANCED':
      return (
        `Coverage ratio of ${fmtPct(coveragePct)} with ${fmtPct(residualPct)} residual exposure ` +
        `reflects a balanced approach to hedge cost and risk mitigation. The portfolio accepts ` +
        `moderate unhedged exposure in exchange for reduced friction costs, appropriate for ` +
        `entities with defined risk appetite tolerances.`
      );
    case 'AGGRESSIVE':
      return (
        `Coverage ratio of ${fmtPct(coveragePct)} with ${fmtPct(residualPct)} residual exposure ` +
        `signals an aggressive risk posture. Significant unhedged exposure remains in the portfolio, ` +
        `which may amplify adverse market movements. This posture is typically associated with ` +
        `opportunistic views on favorable rate movement or cost-constrained hedging programs.`
      );
  }
}

function productLabel(product: string): string {
  switch (product) {
    case 'NDF': return 'Non-Deliverable Forward (NDF)';
    case 'FWD': return 'Deliverable Forward (FWD)';
    default: return product;
  }
}

// ── 1. Executive Summary ─────────────────────────────────────────────────────

export function generateExecutiveSummaryNarrative(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
  totals: ScenarioTotalResult[],
  policy: PolicyConfig,
  validationReport: ValidationReport,
): NarrativeParagraph[] {
  if (buckets.length === 0) {
    return [{
      heading: 'Overview',
      text: 'No exposure buckets are available for analysis. The hedge plan contains no monthly exposure data. Report generation requires at least one active exposure bucket.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const totalExposure = abs(summary.total_commercial_exposure_mxn);
  const totalHedgePos = abs(summary.total_hedge_position_mxn);
  const totalResidual = abs(summary.total_residual_mxn);
  const coveragePct = safeDiv(totalHedgePos, totalExposure);
  const residualPct = safeDiv(totalResidual, totalExposure);
  const posture = riskPostureClassification(summary, totals);
  const compliance = policyComplianceChecks(buckets, summary, policy);
  const coverage = bucketCoverageRatios(buckets);
  const underHedged = coverage.filter(c => c.status === 'UNDER');
  const overHedged = coverage.filter(c => c.status === 'OVER');
  const tradeCount = buckets.filter(b => !b.suppressed && abs(b.action_mxn) > 0).length;

  // Overview
  paragraphs.push({
    heading: 'Overview',
    text:
      `This report presents the FX hedge position analysis for ${buckets.length} monthly ` +
      `exposure ${pluralize(buckets.length, 'bucket')} totaling ${fmtMXN(totalExposure)} MXN ` +
      `in commercial exposure. The hedge plan targets ${fmtPct(policy.hedge_ratios.confirmed)} ` +
      `coverage on confirmed flows and ${fmtPct(policy.hedge_ratios.forecast)} on forecast ` +
      `flows using ${productLabel(policy.execution_product)} instruments.`,
    type: 'OVERVIEW',
  });

  // Key Metrics
  paragraphs.push({
    heading: 'Key Metrics',
    text:
      `The portfolio currently maintains ${fmtPct(coveragePct)} aggregate hedge coverage ` +
      `with ${fmtMXN(totalHedgePos)} MXN in net hedge positions against ` +
      `${fmtMXN(totalExposure)} MXN in commercial exposure. Residual unhedged exposure ` +
      `stands at ${fmtMXN(totalResidual)} MXN, representing ${fmtPct(residualPct)} of ` +
      `total commercial risk. The hedge program generates ${tradeCount} actionable ` +
      `${pluralize(tradeCount, 'trade')} with total friction cost of ` +
      `${fmtUSD(summary.total_friction_usd)}.`,
    type: 'ANALYSIS',
  });

  // Risk Assessment
  {
    let scenarioSentence = '';
    if (totals.length > 0) {
      const worstScenario = totals.reduce((worst, t) =>
        t.total_hedge_benefit_usd < worst.total_hedge_benefit_usd ? t : worst, totals[0]);
      const benefitDirection = worstScenario.total_hedge_benefit_usd >= 0 ? 'reduce' : 'amplify';
      scenarioSentence =
        ` Under the most adverse scenario (${fmtSigma(worstScenario.sigma)} spot shock), ` +
        `the hedge program would ${benefitDirection} portfolio impact by ` +
        `${fmtUSD(abs(worstScenario.total_hedge_benefit_usd))}.`;
    }

    paragraphs.push({
      heading: 'Risk Assessment',
      text:
        `The current hedge posture is classified as ${posture.posture}. ` +
        postureInterpretation(posture.posture, posture.coveragePct, posture.residualPct) +
        scenarioSentence,
      type: 'FINDING',
    });
  }

  // Compliance Status
  {
    const passedCount = compliance.checks.filter(c => c.pass).length;
    const totalChecks = compliance.checks.length;
    const failedChecks = compliance.checks.filter(c => !c.pass);
    let deviationSentence = '';
    if (failedChecks.length > 0) {
      const deviations = failedChecks.map(c => `${c.label} (${c.detail})`).join('; ');
      deviationSentence = ` The following deviations were identified: ${deviations}.`;
    }

    paragraphs.push({
      heading: 'Compliance Status',
      text:
        `Policy compliance assessment yields a score of ${compliance.score}% ` +
        `(${compliance.classification}). ${passedCount} of ${totalChecks} governance ` +
        `${pluralize(totalChecks, 'check')} passed.${deviationSentence}`,
      type: 'FINDING',
    });
  }

  // Data Integrity
  {
    const existingHedgeCount = buckets.filter(b => abs(b.existing_hedges_mxn) > 0).length;
    const engineStatus = validationReport.status;
    const errorCount = validationReport.errors.length;
    const warningCount = validationReport.warnings.length;
    let integrityDetail = '';
    if (errorCount > 0) {
      integrityDetail += ` ${errorCount} validation ${pluralize(errorCount, 'error')} detected.`;
    }
    if (warningCount > 0) {
      integrityDetail += ` ${warningCount} ${pluralize(warningCount, 'warning')} noted.`;
    }

    paragraphs.push({
      heading: 'Data Integrity',
      text:
        `This analysis is based on ${buckets.length} exposure ` +
        `${pluralize(buckets.length, 'bucket')} and ${existingHedgeCount} ` +
        `${pluralize(existingHedgeCount, 'bucket')} with existing hedge positions. ` +
        `Engine validation status: ${engineStatus}.${integrityDetail} ` +
        `Report generated at ${timestamp()}.`,
      type: 'METHODOLOGY',
    });
  }

  // Recommendation (conditional)
  {
    const recommendations: string[] = [];

    if (underHedged.length > 0) {
      const bucketList = underHedged.slice(0, 5).map(c => c.bucket).join(', ');
      recommendations.push(
        `Increase hedge coverage in under-hedged ${pluralize(underHedged.length, 'bucket')}: ` +
        `${bucketList}${underHedged.length > 5 ? ` and ${underHedged.length - 5} more` : ''}.`
      );
    }

    if (overHedged.length > 0) {
      const bucketList = overHedged.slice(0, 5).map(c => c.bucket).join(', ');
      recommendations.push(
        `Review over-hedged ${pluralize(overHedged.length, 'bucket')}: ${bucketList}. ` +
        `Over-hedging increases friction cost without proportional risk reduction.`
      );
    }

    if (compliance.classification === 'BREACH') {
      recommendations.push(
        'Address policy breaches before proceeding to execution. ' +
        'One or more governance thresholds have been exceeded.'
      );
    }

    if (residualPct > 0.3) {
      recommendations.push(
        `Residual exposure of ${fmtPct(residualPct)} exceeds typical institutional thresholds. ` +
        `Consider expanding hedge coverage to reduce unhedged downside risk.`
      );
    }

    if (recommendations.length > 0) {
      paragraphs.push({
        heading: 'Recommendations',
        text:
          `Based on the current analysis, the following actions are recommended: ` +
          recommendations.join(' '),
        type: 'RECOMMENDATION',
      });
    }
  }

  return paragraphs;
}

// ── 2. Exposure Narrative ────────────────────────────────────────────────────

export function generateExposureNarrative(
  buckets: BucketResult[],
): NarrativeParagraph[] {
  if (buckets.length === 0) {
    return [{
      text: 'No exposure data available for narrative generation.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const totalExposure = buckets.reduce((s, b) => s + abs(b.commercial_exposure_mxn), 0);
  const concentration = concentrationAnalysis(buckets);
  const flows = flowComposition(buckets);
  const volatility = cashflowVolatility(buckets);

  // Exposure Overview
  {
    const firstBucket = buckets[0].bucket;
    const lastBucket = buckets[buckets.length - 1].bucket;
    const avgExposure = safeDiv(totalExposure, buckets.length);

    paragraphs.push({
      heading: 'Exposure Overview',
      text:
        `Total commercial exposure amounts to ${fmtMXN(totalExposure)} MXN distributed ` +
        `across ${buckets.length} monthly ${pluralize(buckets.length, 'bucket')} spanning ` +
        `${firstBucket} through ${lastBucket}. Average monthly exposure is ` +
        `${fmtMXN(avgExposure)} MXN. The exposure profile represents the aggregate ` +
        `of confirmed and forecast cashflows requiring hedging consideration under ` +
        `the active policy framework.`,
      type: 'OVERVIEW',
    });
  }

  // Concentration Analysis
  {
    const hhiDesc = hhiLabel(concentration.herfindahlIndex);
    const peakPct = concentration.percentOfTotal;

    paragraphs.push({
      heading: 'Concentration Analysis',
      text:
        `The Herfindahl-Hirschman Index (HHI) of ${concentration.herfindahlIndex.toFixed(4)} ` +
        `indicates ${hhiDesc} exposure distribution. ${concentration.peakBucket} accounts ` +
        `for ${fmtPct(peakPct)} of total commercial exposure ` +
        `(${fmtMXN(concentration.peakAmount)} MXN), representing the primary concentration ` +
        `risk. ${peakPct > 0.3
          ? 'This level of single-bucket concentration warrants monitoring, as adverse rate ' +
            'movements in the peak tenor would disproportionately impact portfolio value.'
          : 'Concentration risk is within acceptable limits for institutional treasury operations.'
        }`,
      type: 'ANALYSIS',
    });
  }

  // Flow Composition
  {
    const confirmedImplication = flows.confirmedPct >= 0.7
      ? 'The high proportion of confirmed flows provides a strong hedging mandate with reduced realization risk.'
      : flows.confirmedPct >= 0.4
        ? 'The balanced mix of confirmed and forecast flows suggests a moderate degree of hedging certainty, with forecast flows requiring ongoing monitoring for realization.'
        : 'The portfolio is predominantly composed of forecast flows, introducing realization uncertainty. Hedge ratios on forecast flows are typically set lower to account for potential non-materialization.';

    paragraphs.push({
      heading: 'Flow Composition',
      text:
        `Confirmed cashflows represent ${fmtPct(flows.confirmedPct)} of total exposure ` +
        `(${fmtMXN(flows.confirmedTotal)} MXN), providing a firm hedging mandate. ` +
        `Forecast flows account for the remaining ${fmtPct(flows.forecastPct)} ` +
        `(${fmtMXN(flows.forecastTotal)} MXN), subject to realization uncertainty ` +
        `and typically hedged at lower ratios. ${confirmedImplication}`,
      type: 'ANALYSIS',
    });
  }

  // Cashflow Timing
  {
    const cvDesc = cvLabel(volatility.coefficientOfVariation);
    const dispersionNote = volatility.coefficientOfVariation > 0.5
      ? 'This suggests uneven exposure distribution that may require bucket-level hedging adjustments to avoid tenor mismatch between hedges and underlying exposures.'
      : 'Cashflow distribution is relatively uniform across tenors, supporting a systematic hedging approach with consistent coverage targets.';

    paragraphs.push({
      heading: 'Cashflow Timing',
      text:
        `The coefficient of variation in cashflow timing is ` +
        `${volatility.coefficientOfVariation.toFixed(3)}, indicating ${cvDesc} dispersion ` +
        `across monthly buckets. Standard deviation of monthly exposures is ` +
        `${fmtMXN(volatility.stdDev)} MXN. ${dispersionNote}`,
      type: 'ANALYSIS',
    });
  }

  return paragraphs;
}

// ── 3. Hedge Efficiency Narrative ────────────────────────────────────────────

export function generateHedgeEfficiencyNarrative(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
): NarrativeParagraph[] {
  if (buckets.length === 0) {
    return [{
      text: 'No hedge data available for efficiency analysis.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const totalExposure = abs(summary.total_commercial_exposure_mxn);
  const totalResidual = abs(summary.total_residual_mxn);
  const coveragePct = safeDiv(abs(summary.total_hedge_position_mxn), totalExposure);
  const residualPct = safeDiv(totalResidual, totalExposure);
  const coverage = bucketCoverageRatios(buckets);
  const mix = instrumentMix(buckets);

  const matchedCount = coverage.filter(c => c.status === 'MATCHED').length;
  const underCount = coverage.filter(c => c.status === 'UNDER').length;
  const overCount = coverage.filter(c => c.status === 'OVER').length;

  // Coverage Assessment
  {
    let bucketsDetail = '';
    if (underCount > 0) {
      const underBuckets = coverage.filter(c => c.status === 'UNDER').slice(0, 5);
      const list = underBuckets.map(c => `${c.bucket} (${fmtPct(c.ratio)})`).join(', ');
      bucketsDetail += ` Under-hedged: ${list}${underCount > 5 ? ` and ${underCount - 5} more` : ''}.`;
    }
    if (overCount > 0) {
      const overBuckets = coverage.filter(c => c.status === 'OVER').slice(0, 5);
      const list = overBuckets.map(c => `${c.bucket} (${fmtPct(c.ratio)})`).join(', ');
      bucketsDetail += ` Over-hedged: ${list}${overCount > 5 ? ` and ${overCount - 5} more` : ''}.`;
    }

    paragraphs.push({
      heading: 'Coverage Assessment',
      text:
        `Aggregate hedge coverage stands at ${fmtPct(coveragePct)} with ` +
        `${matchedCount} ${pluralize(matchedCount, 'bucket')} within target range, ` +
        `${underCount} under-hedged, and ${overCount} over-hedged. ` +
        `${matchedCount === buckets.length
          ? 'All buckets are within the acceptable coverage band (95%-105% of target), indicating well-calibrated hedge positioning.'
          : `Coverage dispersion across buckets indicates ${underCount + overCount > buckets.length / 2
              ? 'significant misalignment'
              : 'minor deviations'} from target ratios that may warrant attention.`
        }${bucketsDetail}`,
      type: 'ANALYSIS',
    });
  }

  // Instrument Mix
  {
    paragraphs.push({
      heading: 'Instrument Mix',
      text:
        `The hedge portfolio comprises ${mix.sellCount} sell (reduce MXN exposure) ` +
        `${pluralize(mix.sellCount, 'position')}, ${mix.buyCount} buy (add MXN exposure) ` +
        `${pluralize(mix.buyCount, 'position')}, and ${mix.suppressedCount} suppressed ` +
        `${pluralize(mix.suppressedCount, 'bucket')} where trade sizes fell below the minimum ` +
        `threshold. Net direction: ${mix.netDirectionLabel}. ` +
        `${mix.suppressedCount > 0
          ? `The ${mix.suppressedCount} suppressed ${pluralize(mix.suppressedCount, 'bucket')} represent ` +
            `exposures too small for cost-effective hedging under current minimum trade size constraints.`
          : 'No buckets were suppressed, indicating all exposures meet the minimum trade size threshold for execution.'
        }`,
      type: 'ANALYSIS',
    });
  }

  // Residual Risk
  {
    const residualDirection = summary.total_residual_mxn > 0
      ? 'LONG MXN'
      : summary.total_residual_mxn < 0
        ? 'SHORT MXN'
        : 'NEUTRAL';

    const riskAssessment = residualPct > 0.2
      ? 'This level of unhedged exposure may introduce material P&L volatility under adverse rate scenarios and should be evaluated against the entity\'s risk appetite framework.'
      : residualPct > 0.05
        ? 'The residual is within typical institutional tolerance bands but should be monitored for drift as positions mature.'
        : 'Residual exposure is minimal, indicating comprehensive hedge coverage across the exposure profile.';

    paragraphs.push({
      heading: 'Residual Risk',
      text:
        `Net residual exposure of ${fmtMXN(totalResidual)} MXN carries a ${residualDirection} ` +
        `directional bias. This residual represents ${fmtPct(residualPct)} of total ` +
        `commercial exposure and constitutes the portfolio's unhedged risk. ${riskAssessment}`,
      type: 'FINDING',
    });
  }

  // Efficiency Recommendation
  {
    const recommendations: string[] = [];

    if (underCount > 0) {
      const underBuckets = coverage.filter(c => c.status === 'UNDER').slice(0, 5).map(c => c.bucket);
      recommendations.push(
        `${pluralize(underCount, 'Bucket')} ${underBuckets.join(', ')}${underCount > 5 ? ` and ${underCount - 5} more` : ''} ` +
        `show coverage below the target threshold. Consider increasing hedge positions ` +
        `in these tenors to improve portfolio alignment with policy targets.`
      );
    }

    if (overCount > 0) {
      const overBuckets = coverage.filter(c => c.status === 'OVER').slice(0, 5).map(c => c.bucket);
      recommendations.push(
        `${pluralize(overCount, 'Bucket')} ${overBuckets.join(', ')}${overCount > 5 ? ` and ${overCount - 5} more` : ''} ` +
        `exceed target coverage. Over-hedging introduces unnecessary friction cost ` +
        `and may create accounting complications. Consider reducing positions to align ` +
        `with target ratios.`
      );
    }

    if (mix.suppressedCount > buckets.length * 0.3) {
      recommendations.push(
        `A significant proportion of buckets (${mix.suppressedCount} of ${buckets.length}) ` +
        `are suppressed due to minimum trade size constraints. Consider reviewing the ` +
        `minimum trade size threshold or aggregating smaller exposures for hedging efficiency.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'The hedge portfolio demonstrates efficient coverage across all active buckets. ' +
        'No immediate adjustments are recommended. Continue monitoring for drift as ' +
        'positions approach maturity.'
      );
    }

    paragraphs.push({
      heading: 'Efficiency Recommendation',
      text: recommendations.join(' '),
      type: 'RECOMMENDATION',
    });
  }

  return paragraphs;
}

// ── 4. Scenario Narrative ────────────────────────────────────────────────────

export function generateScenarioNarrative(
  totals: ScenarioTotalResult[],
  summary: HedgePlanSummary,
  perBucket: ScenarioBucketResult[],
): NarrativeParagraph[] {
  if (totals.length === 0) {
    return [{
      text: 'No scenario analysis data available. Scenario narratives require at least one stress scenario result.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const kpis = scenarioKpis(totals, summary);
  const sigmas = totals.map(t => t.sigma).sort((a, b) => a - b);
  const minSigma = sigmas[0];
  const maxSigma = sigmas[sigmas.length - 1];

  // Methodology
  paragraphs.push({
    heading: 'Methodology',
    text:
      `Scenario analysis applies ${totals.length} parallel spot shocks ranging from ` +
      `${fmtSigma(minSigma)} to ${fmtSigma(maxSigma)} to evaluate hedge effectiveness ` +
      `across market conditions. Each scenario recalculates portfolio value with and ` +
      `without hedge positions in place, computing the differential to assess downside ` +
      `protection. The analysis assumes instantaneous spot rate displacement with no ` +
      `change to forward curve shape or volatility surface.`,
    type: 'METHODOLOGY',
  });

  // Results Overview
  {
    const worstScenario = totals.reduce((worst, t) =>
      t.total_hedge_benefit_usd < worst.total_hedge_benefit_usd ? t : worst, totals[0]);

    paragraphs.push({
      heading: 'Results Overview',
      text:
        `Under the most adverse scenario (${fmtSigma(worstScenario.sigma)} spot shock to ` +
        `${worstScenario.shocked_spot.toFixed(4)}), unhedged portfolio impact would be ` +
        `${fmtUSD(worstScenario.total_unhedged_usd)} versus ` +
        `${fmtUSD(worstScenario.total_hedged_usd)} with hedges in place, yielding a ` +
        `hedge benefit of ${fmtUSD(worstScenario.total_hedge_benefit_usd)}. Average loss ` +
        `reduction across all ${totals.length} scenarios is ` +
        `${fmtUSD(kpis.avgLossReduction)}.`,
      type: 'ANALYSIS',
    });
  }

  // Tail Risk Assessment
  {
    const tailLabel = kpis.tailRiskReductionPct > 0.5
      ? 'strong'
      : kpis.tailRiskReductionPct > 0.2
        ? 'moderate'
        : 'weak';

    const efficiencyNote = kpis.efficiencyPerDollar !== 0
      ? ` The hedge efficiency ratio of ${kpis.efficiencyPerDollar.toFixed(2)} represents ` +
        `${fmtUSD(abs(kpis.avgLossReduction))} of average loss reduction per ` +
        `${fmtUSD(abs(summary.total_friction_usd))} of hedge friction cost.`
      : ' Hedge efficiency ratio cannot be computed due to zero friction cost.';

    paragraphs.push({
      heading: 'Tail Risk Assessment',
      text:
        `Tail risk reduction (scenarios beyond the +/-8% spot shock threshold) stands at ` +
        `${fmtPct(abs(kpis.tailRiskReductionPct))}, indicating ${tailLabel} downside ` +
        `protection in extreme market conditions.${efficiencyNote}`,
      type: 'FINDING',
    });
  }

  // Vulnerability Analysis
  {
    const ranking = vulnerabilityRanking(perBucket, totals);

    if (ranking.length > 0) {
      const top3 = ranking.slice(0, 3);
      const bucketDetails = top3
        .map(r => `${r.bucket} (${fmtPct(r.pctOfTotal)} of total tail impact, ${fmtUSD(r.worstCaseImpact)})`)
        .join('; ');

      paragraphs.push({
        heading: 'Vulnerability Analysis',
        text:
          `Bucket-level vulnerability ranking identifies the following tenors as most ` +
          `exposed under extreme scenarios: ${bucketDetails}. ` +
          `${ranking.length > 3
            ? `An additional ${ranking.length - 3} ${pluralize(ranking.length - 3, 'bucket')} carry measurable tail risk exposure. `
            : ''
          }Concentration of tail risk in specific tenors may warrant targeted hedge ` +
          `reinforcement or maturity adjustment to improve portfolio resilience.`,
        type: 'FINDING',
      });
    } else {
      const posture = riskPostureClassification(summary, totals);
      paragraphs.push({
        heading: 'Vulnerability Analysis',
        text:
          `Bucket-level vulnerability data is not available for the current scenario set. ` +
          `At the portfolio level, the ${posture.posture.toLowerCase()} risk posture with ` +
          `${fmtPct(posture.coveragePct)} coverage provides ` +
          `${posture.worstCaseReductionPct > 0.3 ? 'meaningful' : 'limited'} protection ` +
          `against adverse rate movements. Detailed per-tenor vulnerability assessment ` +
          `requires scenario results at the bucket level.`,
        type: 'FINDING',
      });
    }
  }

  return paragraphs;
}

// ── 5. Compliance Narrative ──────────────────────────────────────────────────

export function generateComplianceNarrative(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
  policy: PolicyConfig,
  validationReport: ValidationReport,
): NarrativeParagraph[] {
  if (buckets.length === 0) {
    return [{
      text: 'No exposure data available for compliance assessment.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const compliance = policyComplianceChecks(buckets, summary, policy);
  const passedCount = compliance.checks.filter(c => c.pass).length;
  const totalChecks = compliance.checks.length;

  // Compliance Overview
  {
    let validationNote = '';
    if (validationReport.status === 'FAIL') {
      validationNote =
        ` Engine validation returned FAIL status with ${validationReport.errors.length} ` +
        `${pluralize(validationReport.errors.length, 'error')}. ` +
        `Compliance assessment should be considered provisional until validation errors are resolved.`;
    }

    paragraphs.push({
      heading: 'Compliance Overview',
      text:
        `Policy compliance assessment against the active hedge policy yields an overall ` +
        `score of ${compliance.score}% with classification: ${compliance.classification}. ` +
        `${passedCount} of ${totalChecks} governance ` +
        `${pluralize(totalChecks, 'check')} passed.${validationNote}`,
      type: 'OVERVIEW',
    });
  }

  // Findings Detail
  {
    const findings = compliance.checks.map(check => {
      const status = check.pass ? 'PASS' : 'FAIL';
      return `${check.label}: ${status} -- ${check.detail}.`;
    });

    paragraphs.push({
      heading: 'Findings Detail',
      text:
        `Individual governance check results are as follows. ` +
        findings.join(' '),
      type: 'FINDING',
    });
  }

  // Policy Parameters
  paragraphs.push({
    heading: 'Policy Parameters',
    text:
      `The active policy specifies the following parameters: bucket mode ` +
      `${policy.bucket_mode}, confirmed hedge ratio target ` +
      `${fmtPct(policy.hedge_ratios.confirmed)}, forecast hedge ratio target ` +
      `${fmtPct(policy.hedge_ratios.forecast)}, spread assumption ` +
      `${policy.cost_assumptions.spread_bps} basis points, execution product ` +
      `${productLabel(policy.execution_product)}, and minimum trade size ` +
      `${fmtUSD(policy.min_trade_size_usd)}. These parameters form the governance ` +
      `framework against which all hedge positions are evaluated.`,
    type: 'METHODOLOGY',
  });

  // Remediation
  {
    const failedChecks = compliance.checks.filter(c => !c.pass);

    if (failedChecks.length > 0) {
      const remediations: string[] = [];

      for (const check of failedChecks) {
        if (check.label.includes('Confirmed hedge ratio')) {
          remediations.push(
            'Increase confirmed flow hedge coverage to meet the target ratio. ' +
            'Consider adding forward positions in under-hedged tenors.'
          );
        } else if (check.label.includes('Forecast hedge ratio')) {
          remediations.push(
            'Review forecast hedge coverage levels. If forecast flows have high confidence, ' +
            'consider increasing hedge ratios subject to realization risk assessment.'
          );
        } else if (check.label.includes('Min trade size')) {
          remediations.push(
            'Consolidate or restructure positions in buckets with sub-threshold trade sizes. ' +
            'Alternatively, review the minimum trade size parameter for appropriateness.'
          );
        } else if (check.label.includes('over-hedged')) {
          remediations.push(
            'Reduce hedge positions in over-hedged buckets to align with target coverage. ' +
            'Over-hedging introduces speculative risk and unnecessary transaction costs.'
          );
        } else if (check.label.includes('suppressed')) {
          remediations.push(
            'Review suppressed buckets for potential consolidation or threshold adjustment. ' +
            'Suppression indicates exposure exists but is not being hedged.'
          );
        }
      }

      paragraphs.push({
        heading: 'Remediation',
        text:
          `The following remediation actions are recommended to address identified ` +
          `policy deviations: ${remediations.join(' ')}`,
        type: 'RECOMMENDATION',
      });
    } else {
      paragraphs.push({
        heading: 'Remediation',
        text:
          `No policy deviations detected. The hedge portfolio is fully aligned with ` +
          `governance requirements across all ${totalChecks} compliance checks. ` +
          `No remediation actions are required at this time. Continued monitoring ` +
          `is recommended as positions approach maturity and cashflow forecasts are updated.`,
        type: 'RECOMMENDATION',
      });
    }
  }

  return paragraphs;
}

// ── 6. VaR Narrative ─────────────────────────────────────────────────────────

export function generateVaRNarrative(
  summary: HedgePlanSummary,
  totals: ScenarioTotalResult[],
): NarrativeParagraph[] {
  if (totals.length === 0) {
    return [{
      text: 'Value at Risk analysis is unavailable. VaR estimation requires scenario analysis results with multiple stress scenarios.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];

  // Sort hedged values to derive percentiles
  const hedgedValues = totals.map(t => t.total_hedged_usd).sort((a, b) => a - b);
  const unhedgedValues = totals.map(t => t.total_unhedged_usd).sort((a, b) => a - b);
  const n = hedgedValues.length;

  // Parametric percentile (linear interpolation)
  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = p * (sorted.length - 1);
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    const frac = index - lo;
    return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
  }

  const hedgedVaR95 = percentile(hedgedValues, 0.05);
  const hedgedVaR99 = percentile(hedgedValues, 0.01);
  const unhedgedVaR95 = percentile(unhedgedValues, 0.05);
  const unhedgedVaR99 = percentile(unhedgedValues, 0.01);

  // VaR improvement (how much better hedged is vs unhedged)
  const varImprovement95 = unhedgedVaR95 !== 0
    ? abs((hedgedVaR95 - unhedgedVaR95) / unhedgedVaR95)
    : 0;

  // Methodology
  paragraphs.push({
    heading: 'Methodology',
    text:
      `Value at Risk (VaR) is estimated using a parametric approach based on scenario ` +
      `analysis results. The distribution of portfolio outcomes across ${n} scenarios ` +
      `provides the basis for confidence interval estimation. VaR figures represent the ` +
      `maximum expected loss at specified confidence levels, computed via linear ` +
      `interpolation of ordered scenario outcomes. This approach captures the empirical ` +
      `distribution of hedge-adjusted portfolio values under the defined shock spectrum.`,
    type: 'METHODOLOGY',
  });

  // VaR Metrics
  paragraphs.push({
    heading: 'VaR Metrics',
    text:
      `The 95% VaR (parametric) for the hedged portfolio is estimated at ` +
      `${fmtUSD(hedgedVaR95)}. The 99% VaR is ${fmtUSD(hedgedVaR99)}. ` +
      `For comparison, the unhedged portfolio 95% VaR is ${fmtUSD(unhedgedVaR95)} ` +
      `and the 99% VaR is ${fmtUSD(unhedgedVaR99)}. These represent the maximum ` +
      `expected loss at the respective confidence levels under the scenario-based ` +
      `distribution. Total hedge friction cost of ${fmtUSD(summary.total_friction_usd)} ` +
      `should be considered as a fixed cost offset against VaR reduction benefits.`,
    type: 'ANALYSIS',
  });

  // Interpretation
  {
    const hedgeEffect = hedgedVaR95 > unhedgedVaR95 ? 'improved' : 'not improved';
    const withWithout = hedgedVaR95 > unhedgedVaR95 ? 'with' : 'without';

    paragraphs.push({
      heading: 'Interpretation',
      text:
        `The VaR analysis indicates that ${withWithout} current hedges, the portfolio's ` +
        `risk profile is ${hedgeEffect} relative to the unhedged baseline. Hedge ` +
        `effectiveness at the 95% confidence level ` +
        `${varImprovement95 > 0
          ? `improves portfolio VaR by ${fmtPct(varImprovement95)}`
          : `shows no measurable VaR improvement`
        }. ${abs(hedgedVaR95) < abs(unhedgedVaR95)
          ? 'The hedged portfolio exhibits a narrower loss distribution, confirming that the hedge program is effective in truncating tail losses.'
          : 'The hedged and unhedged loss distributions are similar, suggesting the hedge program may benefit from recalibration to improve downside protection efficiency.'
        } These estimates are based on the discrete scenario set and should be supplemented ` +
        `with Monte Carlo simulation or historical VaR for comprehensive risk assessment.`,
      type: 'FINDING',
    });
  }

  return paragraphs;
}

// ── 7. Hedge Accounting Narrative ────────────────────────────────────────────

export function generateHedgeAccountingNarrative(
  buckets: BucketResult[],
  summary: HedgePlanSummary,
  policy: PolicyConfig,
): NarrativeParagraph[] {
  if (buckets.length === 0) {
    return [{
      text: 'No hedge data available for accounting effectiveness assessment.',
      type: 'OVERVIEW',
    }];
  }

  const paragraphs: NarrativeParagraph[] = [];
  const totalExposure = abs(summary.total_commercial_exposure_mxn);
  const totalHedgePos = abs(summary.total_hedge_position_mxn);
  const coveragePct = safeDiv(totalHedgePos, totalExposure);
  const coverage = bucketCoverageRatios(buckets);
  const matchedCount = coverage.filter(c => c.status === 'MATCHED').length;
  const flows = flowComposition(buckets);

  // Determine effectiveness level
  const effectivenessLevel = coveragePct >= 0.8 && coveragePct <= 1.25
    ? 'high'
    : coveragePct >= 0.5
      ? 'adequate'
      : 'insufficient';

  // Effectiveness Assessment
  {
    const economicRelationship = coveragePct > 0.1
      ? 'demonstrates an economic relationship with underlying exposures, as changes in the hedging instrument value are expected to offset changes in the hedged item value'
      : 'may not demonstrate sufficient economic relationship for hedge accounting qualification, as coverage levels are below meaningful thresholds';

    paragraphs.push({
      heading: 'Effectiveness Assessment',
      text:
        `Under IFRS 9 / ASC 815 hedge accounting standards, hedge effectiveness is ` +
        `assessed through economic relationship analysis. The current hedge portfolio ` +
        `${economicRelationship}. With aggregate coverage of ${fmtPct(coveragePct)}, ` +
        `the portfolio demonstrates ${effectivenessLevel} economic relationship strength. ` +
        `${effectivenessLevel === 'high'
          ? 'The hedge ratio falls within the 80%-125% effectiveness corridor typically required for hedge accounting qualification under the dollar-offset method.'
          : effectivenessLevel === 'adequate'
            ? 'While the overall hedge ratio is outside the traditional 80%-125% corridor, IFRS 9 principles-based assessment may still support hedge accounting designation based on qualitative analysis.'
            : 'The current hedge ratio falls below the level typically required to demonstrate hedge effectiveness. Entities should evaluate whether hedge accounting designation is appropriate under current conditions.'
        }`,
      type: 'ANALYSIS',
    });
  }

  // Critical Terms Match
  {
    const termsAlignment = matchedCount >= buckets.length * 0.8 ? 'aligned' : 'partially misaligned';
    const confirmedNote = flows.confirmedPct >= 0.7
      ? 'The high proportion of confirmed cashflows strengthens the critical terms matching assessment, as hedge designation against highly probable forecast transactions carries lower de-designation risk.'
      : 'The significant proportion of forecast flows introduces hedge de-designation risk should cashflow forecasts not materialize. Entities should maintain documentation of forecast reliability.';

    paragraphs.push({
      heading: 'Critical Terms Match',
      text:
        `Critical terms matching analysis: ${matchedCount} of ${buckets.length} hedge ` +
        `relationships satisfy the qualitative effectiveness criteria based on coverage ` +
        `ratio alignment. Hedge instrument terms (maturity, notional, currency) are ` +
        `${termsAlignment} with hedged item characteristics. The execution product ` +
        `(${productLabel(policy.execution_product)}) is consistent with the underlying ` +
        `currency pair and settlement requirements. ${confirmedNote}`,
      type: 'ANALYSIS',
    });
  }

  // Disclosure
  paragraphs.push({
    heading: 'Disclosure',
    text:
      `This effectiveness assessment is generated using deterministic calculation methods ` +
      `based on notional matching and coverage ratio analysis. It does not constitute ` +
      `a formal hedge effectiveness test under IFRS 9 B6.4.1-B6.4.6 or ASC 815-20-25. ` +
      `All hedge relationships are subject to ongoing prospective effectiveness testing ` +
      `as required by the applicable accounting standard. Entities should perform ` +
      `independent verification of hedge accounting conclusions, including regression ` +
      `analysis or dollar-offset testing where required by their accounting policy. ` +
      `The confirmed/forecast flow split (${fmtPct(flows.confirmedPct)} / ` +
      `${fmtPct(flows.forecastPct)}) and policy parameters (spread: ` +
      `${policy.cost_assumptions.spread_bps} bps, min trade: ` +
      `${fmtUSD(policy.min_trade_size_usd)}) are inputs to this assessment and should ` +
      `be validated against source documentation.`,
    type: 'DISCLAIMER',
  });

  return paragraphs;
}
