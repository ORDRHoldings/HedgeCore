"use client";

import Card from "./ui/Card";
import type { HedgeRunResponse } from "../lib/types";

interface HedgeTableProps {
  result: HedgeRunResponse | null;
}

export default function HedgeTable({ result }: HedgeTableProps) {
  if (!result) return null;

  const isApproved = result.status === "approved";

  return (
    <Card title="Hedge Calculation Result">
      <div className="space-y-4">
        {/* Status Banner */}
        <div
          className={`rounded px-4 py-3 text-sm font-medium ${
            isApproved
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {isApproved ? "APPROVED" : "REJECTED"}
          {result.reason && ` — ${result.reason}`}
        </div>

        {/* Plan Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Plan ID:</span>
            <span className="ml-2 font-mono text-gray-900">{result.plan_id}</span>
          </div>
          {result.bundle_id && (
            <div>
              <span className="text-gray-500">Bundle ID:</span>
              <span className="ml-2 font-mono text-gray-900">{result.bundle_id}</span>
            </div>
          )}
        </div>

        {/* Summary */}
        {result.summary && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-sm font-semibold text-gray-700 uppercase mb-2">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Total Cost:</span>
                <span className="ml-2 font-medium">
                  ${result.summary.cost_total_usd?.toLocaleString() ?? "N/A"}
                </span>
              </div>
              {result.summary.holding_period_days != null && (
                <div>
                  <span className="text-gray-500">Holding Period:</span>
                  <span className="ml-2 font-medium">
                    {result.summary.holding_period_days} days
                  </span>
                </div>
              )}
            </div>

            {/* Hedge Effectiveness */}
            {result.summary.hedge_effectiveness && (
              <div className="mt-2">
                <span className="text-sm text-gray-500">Effectiveness:</span>
                <div className="mt-1 flex gap-3">
                  {Object.entries(result.summary.hedge_effectiveness).map(([key, val]) => (
                    <span
                      key={key}
                      className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-700"
                    >
                      {key}: {val != null ? `${(val * 100).toFixed(1)}%` : "N/A"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Worst Case */}
            {result.summary.worst_case &&
              Object.keys(result.summary.worst_case).length > 0 && (
                <div className="mt-2">
                  <span className="text-sm text-gray-500">Worst Case:</span>
                  <div className="mt-1 flex gap-3">
                    {Object.entries(result.summary.worst_case).map(([key, val]) => (
                      <span
                        key={key}
                        className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-700"
                      >
                        {key}:{" "}
                        {val.kind === "number"
                          ? `$${val.number?.toLocaleString() ?? "N/A"}`
                          : val.text ?? "N/A"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Meta */}
        {result.meta && (
          <div className="border-t border-gray-100 pt-3 text-sm text-gray-500">
            Engine: {result.meta.engine} {result.meta.version} | Duration:{" "}
            {result.meta.duration_ms}ms
          </div>
        )}

        {/* Decision Details (for rejected) */}
        {!isApproved && result.decision && typeof result.decision === "object" && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-sm font-semibold text-gray-700 uppercase mb-2">
              Decision Details
            </h4>
            <pre className="rounded bg-gray-50 p-3 text-sm text-gray-700 overflow-auto max-h-40">
              {JSON.stringify(result.decision, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
