"use client";

import { useState, ReactNode } from "react";

export interface RailTab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface RailTabsProps {
  tabs: RailTab[];
  initialTab?: string;
  className?: string;
}

export default function RailTabs({
  tabs,
  initialTab,
  className = "",
}: RailTabsProps) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.id ?? "");

  if (tabs.length === 0) return null;

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Tab bar */}
      <div
        className="flex border-b border-[var(--border-rim)] shrink-0"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === current.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={[
                "relative px-3 py-2 text-[0.8125rem] font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              ].join(" ")}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-cyan)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-3" role="tabpanel">
        {current.content}
      </div>
    </div>
  );
}
