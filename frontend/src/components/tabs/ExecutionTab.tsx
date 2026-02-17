"use client";

import type { HedgePlan, ScenarioResults } from '../../api/types';
import ExecutionBridge from '../execution/ExecutionBridge';

interface Props {
  hedgePlan: HedgePlan;
  scenarioResults: ScenarioResults;
  runId: string;
  /** Base currency for the hedge (e.g. 'MXN', 'EUR', 'JPY'). Defaults to 'MXN'. */
  baseCcy?: string;
}

export default function ExecutionTab({ hedgePlan, scenarioResults, runId, baseCcy }: Props) {
  return (
    <ExecutionBridge
      hedgePlan={hedgePlan}
      scenarioResults={scenarioResults}
      runId={runId}
      baseCcy={baseCcy}
    />
  );
}
