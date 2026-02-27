/**
 * pipelineState.ts — Typed state for the 4-step execution pipeline
 *
 * Accumulates data as positions flow through:
 *   Step 1 (REVIEW) → Step 2 (CALCULATE) → Step 3 (RISK CHECK) → Step 4 (EXECUTE)
 */

import type { PositionRow } from "@/api/positionClient";
import type { ComplianceCheck, MonteCarloResult, PortfolioRisk, PortfolioStressResult } from "@/utils/executionAnalytics";
import type { FuturesTicket } from "./contractSizing";

export type PipelineStep = 1 | 2 | 3 | 4;

export interface PipelineState {
  step: PipelineStep;

  // Step 1 output
  selectedPositions: PositionRow[];

  // Step 2 output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calcResult: any | null;     // CalculateResponse from backend
  runId: string | null;

  // Step 3 output
  complianceChecks: ComplianceCheck[];
  stressResults: PortfolioStressResult | null;
  monteCarloResults: Map<string, MonteCarloResult>;
  portfolioRisk: PortfolioRisk | null;
  riskGatePassed: boolean;

  // Step 4 output
  tickets: FuturesTicket[];
  executionConfirmed: boolean;
}

export const INITIAL_PIPELINE: PipelineState = {
  step: 1,
  selectedPositions: [],
  calcResult: null,
  runId: null,
  complianceChecks: [],
  stressResults: null,
  monteCarloResults: new Map(),
  portfolioRisk: null,
  riskGatePassed: false,
  tickets: [],
  executionConfirmed: false,
};
