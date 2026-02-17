"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";

interface RollsTabProps {
  rollLadder: Record<string, unknown> | undefined;
}

export default function RollsTab({ rollLadder }: RollsTabProps) {
  if (!rollLadder) {
    return <EmptyState type="empty" message="No roll data" />;
  }

  const rolls = rollLadder.rolls as Array<Record<string, unknown>> | undefined;
  const totalCost = rollLadder.total_carry_cost as number | undefined;

  return (
    <div className="space-y-3">
      {totalCost != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-secondary)]">
            Total Carry Cost
          </span>
          <span className="font-mono font-semibold text-[var(--text-primary)]">
            ${Number(totalCost).toLocaleString()}
          </span>
        </div>
      )}

      {rolls && rolls.length > 0 ? (
        <div className="space-y-1.5">
          {rolls.map((roll, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs border-b border-[var(--border-rim)]/50 pb-1.5"
            >
              <span className="font-mono text-[var(--accent-cyan)] w-16 shrink-0">
                {String(roll.roll_date ?? `Roll ${i + 1}`)}
              </span>
              <span className="text-[var(--text-secondary)]">
                {String(roll.from_bucket ?? "")} → {String(roll.to_bucket ?? "")}
              </span>
              {roll.carry_cost != null && (
                <span className="ml-auto font-mono text-[var(--text-tertiary)]">
                  ${Number(roll.carry_cost).toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <JsonViewer data={rollLadder} />
      )}
    </div>
  );
}
