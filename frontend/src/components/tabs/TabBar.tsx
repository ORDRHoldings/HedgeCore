"use client";

interface TabDef {
  key: string;
  label: string;
}

interface Props {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="border-b border-[var(--border-rim)] overflow-x-auto" role="tablist">
      <div className="flex -mb-px">
        {tabs.map(t => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(t.key)}
              className={`px-4 py-3 text-sm whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'border-b-2 border-[var(--accent-cyan)] text-[var(--accent-cyan)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
