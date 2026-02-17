"use client";

export interface KpiTileProps {
  label: string;
  value: string | number;
  previousValue?: string | number;
  delta?: string;
  deltaDirection?: "positive" | "negative" | "neutral";
  unit?: string;
  className?: string;
}

export default function KpiTile({
  label,
  value,
  previousValue,
  delta,
  deltaDirection = "neutral",
  unit,
  className = "",
}: KpiTileProps) {
  const deltaColor =
    deltaDirection === "positive"
      ? "text-[var(--accent-green)]"
      : deltaDirection === "negative"
      ? "text-[var(--accent-red)]"
      : "text-[var(--text-tertiary)]";

  return (
    <div
      className={[
        "flex flex-col gap-0.5 px-3 py-2",
        "bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded",
        className,
      ].join(" ")}
    >
      <span className="text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase tracking-wider leading-none">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)] leading-tight">
          {value}
        </span>
        {unit && (
          <span className="text-[0.625rem] text-[var(--text-tertiary)]">{unit}</span>
        )}
      </div>
      {(previousValue !== undefined || delta) && (
        <div className="flex items-center gap-1.5 text-[0.625rem] leading-none">
          {previousValue !== undefined && (
            <span className="text-[var(--text-tertiary)] line-through tabular-nums">
              {previousValue}
            </span>
          )}
          {delta && (
            <span className={`font-medium tabular-nums ${deltaColor}`}>
              {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
