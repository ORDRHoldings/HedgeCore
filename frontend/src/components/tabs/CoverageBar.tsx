"use client";

import { fmtMXN } from '../../utils/formatters';

interface Props {
  totalExposure: number;
  existingHedges: number;
  newAction: number;
  residual: number;
}

export default function CoverageBar({ totalExposure, existingHedges, newAction, residual }: Props) {
  const absExposure = Math.abs(totalExposure);
  if (absExposure === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] text-center py-2">No exposure to display.</div>
    );
  }

  const pctExisting = (Math.abs(existingHedges) / absExposure) * 100;
  const pctNew = (Math.abs(newAction) / absExposure) * 100;
  const pctResidual = (Math.abs(residual) / absExposure) * 100;

  return (
    <div className="space-y-2">
      <div className="h-6 rounded-full overflow-hidden flex bg-white/5">
        {pctExisting > 0 && (
          <div
            className="bg-[#6B7280] h-full transition-all"
            style={{ width: `${Math.min(pctExisting, 100)}%` }}
            title={`Existing Hedges: ${fmtMXN(existingHedges)} MXN`}
          />
        )}
        {pctNew > 0 && (
          <div
            className="bg-[var(--accent-cyan)] h-full transition-all"
            style={{ width: `${Math.min(pctNew, 100)}%` }}
            title={`New Action: ${fmtMXN(newAction)} MXN`}
          />
        )}
        {pctResidual > 0 && (
          <div
            className="bg-[var(--accent-amber)] h-full transition-all"
            style={{ width: `${Math.min(pctResidual, 100)}%` }}
            title={`Residual: ${fmtMXN(residual)} MXN`}
          />
        )}
      </div>

      <div className="flex gap-4 text-xs text-[var(--text-secondary)] font-mono">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#6B7280]" />
          Existing {pctExisting.toFixed(0)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[var(--accent-cyan)]" />
          New {pctNew.toFixed(0)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[var(--accent-amber)]" />
          Residual {pctResidual.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
