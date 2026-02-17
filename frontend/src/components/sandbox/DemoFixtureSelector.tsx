"use client";

import { DEMO_FIXTURES } from "../../constants/demoData";
import type { DemoFixture } from "../../constants/demoData";

interface DemoFixtureSelectorProps {
  fixtureId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

export default function DemoFixtureSelector({
  fixtureId,
  loading,
  onSelect,
}: DemoFixtureSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        Demo:
      </span>
      {DEMO_FIXTURES.map((f: DemoFixture) => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          disabled={loading}
          className={[
            "px-2 py-1 text-[0.6875rem] font-medium rounded transition-colors",
            fixtureId === f.id
              ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-sub)]",
          ].join(" ")}
        >
          {f.label}
        </button>
      ))}
      {loading && (
        <div className="w-4 h-4 rounded-full border-2 border-[var(--border-rim)] border-t-[var(--accent-cyan)] animate-spin" />
      )}
    </div>
  );
}
