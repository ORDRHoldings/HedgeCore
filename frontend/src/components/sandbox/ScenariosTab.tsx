"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";

interface ScenariosTabProps {
  extendedScenarios: Record<string, unknown> | undefined;
  scenarioResults: Record<string, unknown> | undefined;
}

export default function ScenariosTab({
  extendedScenarios,
  scenarioResults,
}: ScenariosTabProps) {
  const data = extendedScenarios ?? scenarioResults;

  if (!data) {
    return <EmptyState type="empty" message="No scenario data" />;
  }

  const scenarios = (data as Record<string, unknown>).scenarios as
    | Array<Record<string, unknown>>
    | undefined;

  return (
    <div className="space-y-3">
      {scenarios && scenarios.length > 0 ? (
        <div className="space-y-2">
          {scenarios.map((sc, i) => {
            const name = String(
              sc.scenario_name ?? sc.name ?? `Scenario ${i + 1}`
            );
            const pnl = sc.portfolio_pnl as number | undefined;
            return (
              <div
                key={i}
                className="flex items-center justify-between text-xs border-b border-[var(--border-rim)]/50 pb-1.5"
              >
                <span className="text-[var(--text-secondary)]">{name}</span>
                {pnl != null && (
                  <span
                    className={`font-mono font-semibold ${
                      pnl < 0
                        ? "text-[var(--accent-red)]"
                        : "text-[var(--accent-green)]"
                    }`}
                  >
                    ${pnl.toLocaleString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <JsonViewer data={data} />
      )}
    </div>
  );
}
