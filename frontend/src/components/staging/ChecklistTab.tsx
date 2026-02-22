"use client";

const GOVERNANCE_CHECKLIST = [
  "Freeze artifact complete",
  "Policy hash matches current",
  "Approval threshold satisfied",
  "Cooling-off period satisfied",
  "Root hash reproducible",
  "Deterministic rounding applied",
  "Replay verified",
  "Capital buffer above minimum",
  "No concentration breaches",
  "Forward arbitrage within tolerance",
] as const;

interface ChecklistTabProps {
  /** Optional: pass true/false per item if backend provides check results */
  results?: Record<string, boolean>;
}

export default function ChecklistTab({ results }: ChecklistTabProps) {
  return (
    <div className="text-sm text-[var(--text-secondary)] space-y-1">
      {GOVERNANCE_CHECKLIST.map((item, i) => {
        const key = item.toLowerCase().replace(/\s+/g, "_");
        const checked = results?.[key];

        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className={[
                "w-4 h-4 rounded-full border flex items-center justify-center text-[0.8125rem] shrink-0",
                checked === true
                  ? "border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/10"
                  : checked === false
                  ? "border-[var(--accent-red)] text-[var(--accent-red)] bg-[var(--accent-red)]/10"
                  : "border-[var(--border-rim)]",
              ].join(" ")}
            >
              {checked === true
                ? "✓"
                : checked === false
                ? "✗"
                : i + 1}
            </span>
            <span
              className={
                checked === false
                  ? "text-[var(--accent-red)]"
                  : ""
              }
            >
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
}
