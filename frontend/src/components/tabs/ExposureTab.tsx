"use client";

import type { HedgePlan } from '../../api/types';
import ExposureChart from '../results/ExposureChart';
import HedgePlanTable from '../results/HedgePlanTable';

interface Props {
  hedgePlan: HedgePlan;
}

export default function ExposureTab({ hedgePlan }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Exposure by Bucket</h3>
        <ExposureChart buckets={hedgePlan.buckets} />
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Hedge Plan Detail</h3>
        <HedgePlanTable plan={hedgePlan} />
      </div>
    </div>
  );
}
